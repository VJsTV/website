import { preflight, originAllowed, previewAllowed } from "./cors.js";
import { json } from "./json.js";
import { verifyTurnstile } from "./turnstile.js";
import { checkRateLimit } from "./rate-limit.js";
import { readBody } from "./validation.js";

// Required defaults for every form endpoint.
// Keep at task-spec values: 5 requests / minute, 50 / day per IP.
const DEFAULT_PER_MINUTE = 5;
const DEFAULT_PER_DAY = 50;

export async function guardPost(request, env, opts) {
  const options = opts || {};

  const pre = preflight(request, env, "POST, OPTIONS");
  if (pre) return { response: pre };

  if (request.method !== "POST") {
    return { response: json({ success: false, error: "Method not allowed" }, 405, request, env) };
  }

  if (!originAllowed(request, env)) {
    return { response: json({ success: false, error: "Origin not allowed." }, 403, request, env) };
  }

  if (!env.GITHUB_TOKEN) {
    return { response: json({ success: false, error: "Server configuration error." }, 500, request, env) };
  }

  // Turnstile policy:
  //   - If we are NOT a preview env and the secret is missing,
  //     refuse the request — production must never serve forms without
  //     server-side bot mitigation.
  //   - If the secret IS configured, validate the token unconditionally.
  //   - Only when running as a preview/dev environment (ALLOW_PREVIEW_ORIGINS=1)
  //     AND the secret is intentionally not configured, do we skip the check.
  const isPreview = previewAllowed(env);
  const hasTurnstileSecret = !!env.TURNSTILE_SECRET_KEY;

  if (!isPreview && !hasTurnstileSecret) {
    return {
      response: json(
        { success: false, error: "Service temporarily unavailable. Please try again later." },
        503, request, env
      ),
    };
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const limit = await checkRateLimit(
    env,
    (options.endpoint || "post") + ":" + ip,
    typeof options.perMinute === "number" ? options.perMinute : DEFAULT_PER_MINUTE,
    typeof options.perDay === "number" ? options.perDay : DEFAULT_PER_DAY
  );
  if (!limit.allowed) {
    return {
      response: json(
        { success: false, error: "Rate limit exceeded. Please try again later." },
        429, request, env,
        { "Retry-After": String(limit.retryAfter || 60) }
      ),
    };
  }

  let data;
  try {
    data = await readBody(request);
  } catch (e) {
    return { response: json({ success: false, error: "Invalid request body." }, 400, request, env) };
  }

  if (!data || typeof data !== "object") {
    return { response: json({ success: false, error: "Invalid request body." }, 400, request, env) };
  }

  if (data.honeypot || data.website_url) {
    return { response: json({ success: true }, 200, request, env), trapped: true };
  }

  if (hasTurnstileSecret) {
    const tsToken = data["cf-turnstile-response"] || data.turnstile_token;
    if (!tsToken) {
      return {
        response: json(
          { success: false, error: "Verification required. Please complete the challenge." },
          403, request, env
        ),
      };
    }
    const ok = await verifyTurnstile(tsToken, env, ip);
    if (!ok) {
      return {
        response: json(
          { success: false, error: "Verification failed. Please refresh and try again." },
          403, request, env
        ),
      };
    }
  }

  return { data, ip };
}
