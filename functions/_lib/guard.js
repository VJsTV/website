import { preflight, originAllowed } from "./cors.js";
import { json } from "./json.js";
import { verifyTurnstile } from "./turnstile.js";
import { checkRateLimit } from "./rate-limit.js";
import { readBody } from "./validation.js";

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

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const limit = await checkRateLimit(
    env,
    (options.endpoint || "post") + ":" + ip,
    options.perMinute || 5,
    options.perDay || 50
  );
  if (!limit.allowed) {
    return {
      response: json(
        { success: false, error: "Rate limit exceeded. Please try again later." },
        429,
        request,
        env,
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

  const tsToken = data["cf-turnstile-response"] || data.turnstile_token;
  const turnstileOk = await verifyTurnstile(tsToken, env, ip);
  if (!turnstileOk) {
    return {
      response: json(
        { success: false, error: "Verification failed. Please refresh and try again." },
        403,
        request,
        env
      ),
    };
  }

  return { data, ip };
}
