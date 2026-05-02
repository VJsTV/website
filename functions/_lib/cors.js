const DEFAULT_ALLOWED = [
  "https://vjstv.com",
  "https://www.vjstv.com",
];

function parseAllowedOrigins(env) {
  if (env && env.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(",")
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }
  return DEFAULT_ALLOWED.slice();
}

export function previewAllowed(env) {
  if (!env) return false;
  const flag = env.ALLOW_PREVIEW_ORIGINS;
  if (flag === undefined || flag === null) return false;
  const v = String(flag).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function isPreviewOrigin(origin) {
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    if (u.hostname.endsWith(".pages.dev")) return true;
  } catch (e) {}
  return false;
}

export function getAllowedOrigin(request, env) {
  const allowed = parseAllowedOrigins(env);
  const origin = request.headers.get("Origin");
  if (!origin) return allowed[0];
  if (allowed.indexOf(origin) !== -1) return origin;
  if (previewAllowed(env) && isPreviewOrigin(origin)) return origin;
  return allowed[0];
}

// Strict: a missing Origin header is treated as not allowed for protected
// endpoints. Browsers always set Origin on cross-origin POSTs and on most
// same-origin POSTs; non-browser clients (curl, scripts) can opt in by
// sending Origin: <one of the allowlist entries>.
export function originAllowed(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  const allowed = parseAllowedOrigins(env);
  if (allowed.indexOf(origin) !== -1) return true;
  if (previewAllowed(env) && isPreviewOrigin(origin)) return true;
  return false;
}

export function corsHeaders(request, env, methods) {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(request, env),
    "Access-Control-Allow-Methods": methods || "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function preflight(request, env, methods) {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(request, env, methods) });
}
