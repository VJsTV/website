#!/usr/bin/env bash
# scripts/smoke-api.sh
# ---------------------------------------------------------------------------
# Smoke test for the consolidated /api/* surface. Exercises the security
# controls added in Task #1: CORS allowlist, honeypot, validation, video-host
# allowlist, email validation, method gating, Turnstile-bypass rejection,
# success semantics (201 on create), and analytics availability.
#
# Usage:
#   ./scripts/smoke-api.sh                                # local Express dev
#   ./scripts/smoke-api.sh https://vjstv.com              # production
#   BASE=https://staging.pages.dev ./scripts/smoke-api.sh
#
# Optional flags (env vars):
#   ORIGIN_OK                allowed origin to send (default: https://vjstv.com)
#   ORIGIN_BAD               disallowed origin used for negative tests
#   SMOKE_REQUIRE_TURNSTILE  set to 1 if the target requires Turnstile, so the
#                            "POST without token" check expects 403/503
#   SMOKE_ALLOW_503          set to 1 if the target is configured WITHOUT a
#                            Turnstile secret in production-like mode (every
#                            POST should then return 503)
#   SMOKE_VALID_PAYLOAD      set to 1 to test the 201-on-create success path.
#                            Skipped by default to avoid creating real GitHub
#                            issues from a smoke run.
#
# Exit code is 0 only when every executed check passes.
# ---------------------------------------------------------------------------
set -u

BASE="${1:-${BASE:-http://127.0.0.1:5000}}"
ORIGIN_OK="${ORIGIN_OK:-https://vjstv.com}"
ORIGIN_BAD="${ORIGIN_BAD:-https://evil.example.com}"
SMOKE_REQUIRE_TURNSTILE="${SMOKE_REQUIRE_TURNSTILE:-0}"
SMOKE_ALLOW_503="${SMOKE_ALLOW_503:-0}"
SMOKE_VALID_PAYLOAD="${SMOKE_VALID_PAYLOAD:-0}"

PASS=0
FAIL=0
SKIP=0

color() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
ok()    { PASS=$((PASS+1)); color "32" "  PASS"; printf "  %s\n" "$1"; }
bad()   { FAIL=$((FAIL+1)); color "31" "  FAIL"; printf "  %s — %s\n" "$1" "$2"; }
skip()  { SKIP=$((SKIP+1)); color "33" "  SKIP"; printf "  %s — %s\n" "$1" "$2"; }
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

# Returns true if $1 matches one of $2 $3 ... (used for "got X, expected one of …").
in_list() {
  local needle="$1" ; shift
  local h
  for h in "$@"; do
    [ "$needle" = "$h" ] && return 0
  done
  return 1
}

title "Target: $BASE"
title "Mode flags: SMOKE_REQUIRE_TURNSTILE=$SMOKE_REQUIRE_TURNSTILE SMOKE_ALLOW_503=$SMOKE_ALLOW_503 SMOKE_VALID_PAYLOAD=$SMOKE_VALID_PAYLOAD"

# ---------- /api/health ----------
title "/api/health"
code=$(req GET /api/health "")
if [ "$code" = "200" ] && grep -q '"status":"ok"' /tmp/smoke_body; then
  ok "GET returns 200 + status:ok"
else
  bad "GET /api/health" "got HTTP $code body=$(cat /tmp/smoke_body)"
fi

code=$(req POST /api/health "")
if in_list "$code" "405" "404"; then
  ok "Non-GET rejected ($code)"
else
  bad "POST /api/health" "expected 405/404, got $code"
fi

# ---------- CORS preflight ----------
title "CORS preflight"
code=$(req OPTIONS /api/submit "" "Origin: $ORIGIN_OK" "Access-Control-Request-Method: POST")
if in_list "$code" "200" "204"; then
  ok "Preflight from allowed origin returns 2xx"
else
  bad "Preflight allowed origin" "got $code"
fi

# ---------- Origin enforcement ----------
title "Origin enforcement on POST"
code=$(req POST /api/partner '{"full_name":"T","email":"t@example.com","message":"hi"}' "Origin: $ORIGIN_BAD")
if [ "$code" = "403" ]; then
  ok "Disallowed origin POST blocked with 403"
elif [ "$SMOKE_ALLOW_503" = "1" ] && [ "$code" = "503" ]; then
  # Production-like with no Turnstile secret short-circuits before origin
  # check is moot — still considered hardened.
  ok "Server in 503 lockout (acceptable when SMOKE_ALLOW_503=1)"
else
  bad "Origin block" "expected 403, got $code body=$(head -c 200 /tmp/smoke_body)"
fi

# ---------- 503 lockout when production has no Turnstile secret ----------
if [ "$SMOKE_ALLOW_503" = "1" ]; then
  title "Production lockout (no Turnstile secret)"
  code=$(req POST /api/partner '{"full_name":"T","email":"t@example.com","message":"hi"}' "Origin: $ORIGIN_OK")
  if [ "$code" = "503" ]; then
    ok "POST to protected endpoint is locked out with 503"
  else
    bad "503 lockout" "expected 503, got $code"
  fi
fi

# ---------- Honeypot ----------
title "Honeypot trap"
code=$(req POST /api/partner '{"full_name":"T","email":"t@example.com","message":"hi","website_url":"http://spam"}' "Origin: $ORIGIN_OK")
if [ "$code" = "200" ] && grep -q '"success":true' /tmp/smoke_body; then
  ok "Honeypot returns 200 + success:true (silent drop)"
elif [ "$SMOKE_ALLOW_503" = "1" ] && [ "$code" = "503" ]; then
  skip "Honeypot" "skipped under SMOKE_ALLOW_503=1"
else
  bad "Honeypot" "expected 200 success:true, got $code body=$(head -c 200 /tmp/smoke_body)"
fi

# ---------- Validation: missing required fields ----------
title "Validation"
for ep in /api/partner /api/booking /api/submit; do
  code=$(req POST "$ep" '{}' "Origin: $ORIGIN_OK")
  if [ "$code" = "400" ]; then
    ok "$ep empty body -> 400"
  elif [ "$SMOKE_REQUIRE_TURNSTILE" = "1" ] && in_list "$code" "403"; then
    # Turnstile gate fires before body validation when the token is missing.
    ok "$ep empty body blocked by Turnstile (403)"
  elif [ "$SMOKE_ALLOW_503" = "1" ] && [ "$code" = "503" ]; then
    skip "$ep empty body" "skipped under SMOKE_ALLOW_503=1"
  else
    bad "$ep empty body" "expected 400, got $code"
  fi
done

# ---------- Turnstile-bypass rejection ----------
if [ "$SMOKE_REQUIRE_TURNSTILE" = "1" ]; then
  title "Turnstile bypass rejection"
  payload='{"full_name":"T","email":"t@example.com","message":"This is a partnership enquiry without a Turnstile token at all."}'
  code=$(req POST /api/partner "$payload" "Origin: $ORIGIN_OK")
  if [ "$code" = "403" ]; then
    ok "Missing token rejected with 403"
  else
    bad "Missing token" "expected 403, got $code body=$(head -c 200 /tmp/smoke_body)"
  fi

  payload2='{"full_name":"T","email":"t@example.com","message":"Same as above with an obviously bogus token.","cf-turnstile-response":"definitely-not-a-real-token"}'
  code=$(req POST /api/partner "$payload2" "Origin: $ORIGIN_OK")
  if [ "$code" = "403" ]; then
    ok "Bogus token rejected with 403"
  else
    bad "Bogus token" "expected 403, got $code body=$(head -c 200 /tmp/smoke_body)"
  fi
else
  title "Turnstile bypass rejection"
  skip "Turnstile bypass" "set SMOKE_REQUIRE_TURNSTILE=1 on a target with TURNSTILE_SECRET_KEY"
fi

# ---------- Video URL host validation ----------
title "Video URL host validation"
code=$(req POST /api/submit '{"artist":"X","project_title":"Y","email":"a@b.co","video_url":"https://evil.example.com/v","description":"d","category":"vj-set"}' "Origin: $ORIGIN_OK")
if [ "$code" = "400" ] && grep -qi "vimeo\|youtube\|youtu" /tmp/smoke_body; then
  ok "Non-Vimeo/YouTube video URL rejected"
elif [ "$SMOKE_REQUIRE_TURNSTILE" = "1" ] && [ "$code" = "403" ]; then
  ok "Blocked by Turnstile gate before validation (acceptable)"
elif [ "$SMOKE_ALLOW_503" = "1" ] && [ "$code" = "503" ]; then
  skip "Video host check" "skipped under SMOKE_ALLOW_503=1"
else
  bad "Video host check" "expected 400, got $code body=$(head -c 200 /tmp/smoke_body)"
fi

# Reject http:// even on an allowed host
code=$(req POST /api/submit '{"artist":"X","project_title":"Y","email":"a@b.co","video_url":"http://vimeo.com/123","description":"d","category":"vj-set"}' "Origin: $ORIGIN_OK")
if [ "$code" = "400" ] && grep -qi "https" /tmp/smoke_body; then
  ok "http:// scheme rejected on allowed host"
elif [ "$SMOKE_REQUIRE_TURNSTILE" = "1" ] && [ "$code" = "403" ]; then
  ok "Blocked by Turnstile gate before scheme check"
elif [ "$SMOKE_ALLOW_503" = "1" ] && [ "$code" = "503" ]; then
  skip "https-only" "skipped under SMOKE_ALLOW_503=1"
else
  bad "https-only check" "expected 400, got $code body=$(head -c 200 /tmp/smoke_body)"
fi

# ---------- Email validation ----------
title "Email validation"
code=$(req POST /api/partner '{"full_name":"T","email":"not-an-email","message":"hi"}' "Origin: $ORIGIN_OK")
if [ "$code" = "400" ]; then
  ok "Invalid email rejected with 400"
elif [ "$SMOKE_REQUIRE_TURNSTILE" = "1" ] && [ "$code" = "403" ]; then
  ok "Blocked by Turnstile gate before email check"
elif [ "$SMOKE_ALLOW_503" = "1" ] && [ "$code" = "503" ]; then
  skip "Email validation" "skipped under SMOKE_ALLOW_503=1"
else
  bad "Email validation" "expected 400, got $code"
fi

# ---------- Method gating ----------
title "Method gating"
code=$(req GET /api/submit "")
if [ "$code" = "405" ]; then
  ok "GET /api/submit -> 405"
elif [ "$code" = "404" ]; then
  skip "GET on POST endpoint" "endpoint not mounted on this target ($code)"
else
  bad "GET on POST endpoint" "expected 405, got $code"
fi

# ---------- Analytics ----------
title "/api/analytics"
code=$(req GET /api/analytics "" "Origin: $ORIGIN_OK")
if in_list "$code" "200"; then
  ok "GET /api/analytics returns 200 (configured or stubbed)"
elif [ "$code" = "404" ]; then
  skip "/api/analytics" "endpoint not mounted on this target"
else
  bad "GET /api/analytics" "expected 200, got $code"
fi

# ---------- Success semantics: 201 on create ----------
if [ "$SMOKE_VALID_PAYLOAD" = "1" ] && [ "$SMOKE_REQUIRE_TURNSTILE" != "1" ]; then
  title "201 on successful create"
  payload='{"full_name":"Smoke Test","email":"smoke@vjstv.com","message":"smoke test create"}'
  code=$(req POST /api/partner "$payload" "Origin: $ORIGIN_OK")
  if [ "$code" = "201" ] && grep -q '"success":true' /tmp/smoke_body; then
    ok "POST /api/partner returns 201 + success:true"
  else
    bad "201 success" "expected 201, got $code body=$(head -c 200 /tmp/smoke_body)"
  fi
else
  title "201 on successful create"
  skip "201 path" "set SMOKE_VALID_PAYLOAD=1 (and unset SMOKE_REQUIRE_TURNSTILE) to exercise — creates a real GitHub issue"
fi

# ---------- Summary ----------
printf "\n"
if [ "$FAIL" = "0" ]; then
  color "32" "ALL EXECUTED CHECKS PASSED"
  printf "  (%d passed, %d skipped)\n" "$PASS" "$SKIP"
  exit 0
else
  color "31" "SOME CHECKS FAILED"
  printf "  (%d passed, %d failed, %d skipped)\n" "$PASS" "$FAIL" "$SKIP"
  exit 1
fi
