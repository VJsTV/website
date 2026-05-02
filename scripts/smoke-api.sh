#!/usr/bin/env bash
# scripts/smoke-api.sh
# ---------------------------------------------------------------------------
# Smoke test for the consolidated /api/* surface. Runs against either the
# local Express dev server (api/server.js) or a deployed Pages Functions URL.
#
# Usage:
#   ./scripts/smoke-api.sh                       # http://127.0.0.1:5000
#   ./scripts/smoke-api.sh https://vjstv.com     # production
#   BASE=https://staging.pages.dev ./scripts/smoke-api.sh
#
# Exit code is 0 only if every check passes.
# ---------------------------------------------------------------------------
set -u

BASE="${1:-${BASE:-http://127.0.0.1:5000}}"
ORIGIN_OK="${ORIGIN_OK:-https://vjstv.com}"
ORIGIN_BAD="${ORIGIN_BAD:-https://evil.example.com}"

PASS=0
FAIL=0

color() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
ok()    { PASS=$((PASS+1)); color "32" "  PASS"; printf "  %s\n" "$1"; }
bad()   { FAIL=$((FAIL+1)); color "31" "  FAIL"; printf "  %s — %s\n" "$1" "$2"; }
title() { printf "\n\033[1m%s\033[0m\n" "$1"; }

req() {
  # req METHOD PATH [DATA] [EXTRA_HEADERS...]
  local method="$1" path="$2" data="${3:-}" ; shift 3 || shift $#
  local extra=( "$@" )
  local args=( -s -o /tmp/smoke_body -w '%{http_code}' -X "$method" )
  for h in "${extra[@]}"; do args+=( -H "$h" ); done
  if [ -n "$data" ]; then
    args+=( -H 'Content-Type: application/json' -d "$data" )
  fi
  curl --max-time 15 "${args[@]}" "$BASE$path"
}

title "Target: $BASE"

# ---------- /api/health ----------
title "/api/health"
code=$(req GET /api/health "")
if [ "$code" = "200" ] && grep -q '"status":"ok"' /tmp/smoke_body; then
  ok "GET returns 200 + status:ok"
else
  bad "GET /api/health" "got HTTP $code body=$(cat /tmp/smoke_body)"
fi

code=$(req POST /api/health "")
if [ "$code" = "405" ]; then
  ok "POST rejected with 405"
else
  bad "POST /api/health" "expected 405, got $code"
fi

# ---------- CORS preflight ----------
title "CORS preflight"
code=$(req OPTIONS /api/submit "" "Origin: $ORIGIN_OK" "Access-Control-Request-Method: POST")
if [ "$code" = "204" ] || [ "$code" = "200" ]; then
  ok "Preflight from allowed origin returns 2xx"
else
  bad "Preflight allowed origin" "got $code"
fi

# ---------- Origin enforcement ----------
title "Origin enforcement on POST"
code=$(req POST /api/partner '{"full_name":"T","email":"t@example.com","message":"hi"}' "Origin: $ORIGIN_BAD")
if [ "$code" = "403" ]; then
  ok "Disallowed origin POST blocked with 403"
else
  bad "Origin block" "expected 403, got $code body=$(head -c 200 /tmp/smoke_body)"
fi

# ---------- Honeypot ----------
title "Honeypot trap"
code=$(req POST /api/partner '{"full_name":"T","email":"t@example.com","message":"hi","website_url":"http://spam"}' "Origin: $ORIGIN_OK")
if [ "$code" = "200" ] && grep -q '"success":true' /tmp/smoke_body; then
  ok "Honeypot returns 200 + success:true (silent drop)"
else
  bad "Honeypot" "expected 200 success:true, got $code body=$(head -c 200 /tmp/smoke_body)"
fi

# ---------- Validation: missing required fields ----------
title "Validation"
code=$(req POST /api/partner '{}' "Origin: $ORIGIN_OK")
if [ "$code" = "400" ]; then
  ok "/api/partner empty body -> 400"
else
  bad "/api/partner empty" "expected 400, got $code"
fi

code=$(req POST /api/booking '{}' "Origin: $ORIGIN_OK")
if [ "$code" = "400" ]; then
  ok "/api/booking empty body -> 400"
else
  bad "/api/booking empty" "expected 400, got $code"
fi

code=$(req POST /api/submit '{}' "Origin: $ORIGIN_OK")
if [ "$code" = "400" ]; then
  ok "/api/submit empty body -> 400"
else
  bad "/api/submit empty" "expected 400, got $code"
fi

# ---------- Video URL host validation ----------
title "Video URL host validation"
code=$(req POST /api/submit '{"artist":"X","project_title":"Y","email":"a@b.co","video_url":"https://evil.example.com/v","description":"d","category":"vj-set"}' "Origin: $ORIGIN_OK")
if [ "$code" = "400" ] && grep -qi "vimeo\|youtube" /tmp/smoke_body; then
  ok "Non-Vimeo/YouTube video URL rejected"
else
  bad "Video host check" "expected 400, got $code body=$(head -c 200 /tmp/smoke_body)"
fi

# ---------- Email validation ----------
title "Email validation"
code=$(req POST /api/partner '{"full_name":"T","email":"not-an-email","message":"hi"}' "Origin: $ORIGIN_OK")
if [ "$code" = "400" ]; then
  ok "Invalid email rejected with 400"
else
  bad "Email validation" "expected 400, got $code"
fi

# ---------- Method gating ----------
title "Method gating"
code=$(req GET /api/submit "")
if [ "$code" = "405" ]; then
  ok "GET /api/submit -> 405"
else
  bad "GET on POST endpoint" "expected 405, got $code"
fi

# ---------- Analytics ----------
title "/api/analytics"
code=$(req GET /api/analytics "" "Origin: $ORIGIN_OK")
if [ "$code" = "200" ]; then
  ok "GET /api/analytics returns 200 (configured or stubbed)"
else
  bad "GET /api/analytics" "expected 200, got $code"
fi

# ---------- Summary ----------
printf "\n"
if [ "$FAIL" = "0" ]; then
  color "32" "ALL CHECKS PASSED"
  printf "  (%d passed)\n" "$PASS"
  exit 0
else
  color "31" "SOME CHECKS FAILED"
  printf "  (%d passed, %d failed)\n" "$PASS" "$FAIL"
  exit 1
fi
