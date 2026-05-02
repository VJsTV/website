import { json } from "../_lib/json.js";
import { preflight, originAllowed, previewAllowed } from "../_lib/cors.js";
import { checkRateLimit } from "../_lib/rate-limit.js";
import { verifyTurnstile } from "../_lib/turnstile.js";
import { readBody, isValidEmail } from "../_lib/validation.js";
import { sendEmail, emailTemplate } from "../_lib/email.js";

/**
 * POST /api/subscribe
 *
 * Intentionally does NOT go through guardPost — guardPost requires
 * GITHUB_TOKEN (for the GitHub Issues integration) which subscribe does
 * not need.  This function implements its own equivalent pipeline:
 *   CORS preflight → origin check → rate limit → body parse →
 *   honeypot → Turnstile (when secret is set) → business logic.
 *
 * Turnstile policy mirrors guardPost exactly:
 *   - Production (no ALLOW_PREVIEW_ORIGINS) + no TURNSTILE_SECRET_KEY → 503
 *   - Secret configured → token required, validated
 *   - Preview env + no secret → skip (dev/local builds work without widget)
 */

const ALLOWED_SOURCES = new Set([
  "footer",
  "free-loops",
  "thank-you",
  "homepage",
  "modal",
  "unknown",
]);

function siteOrigin(env) {
  if (env && env.SITE_ORIGIN) return String(env.SITE_ORIGIN).replace(/\/+$/, "");
  return "https://vjstv.com";
}

function genToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function emailKey(email) {
  return "sub:" + String(email).trim().toLowerCase();
}

function tokenKey(token) {
  return "sub-token:" + token;
}

export async function onRequest(context) {
  const { request, env } = context;

  // ── CORS preflight ────────────────────────────────────────────────────────
  const pre = preflight(request, env, "POST, OPTIONS");
  if (pre) return pre;

  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed." }, 405, request, env);
  }

  if (!originAllowed(request, env)) {
    return json({ success: false, error: "Origin not allowed." }, 403, request, env);
  }

  // ── Turnstile gating (same policy as guardPost) ───────────────────────────
  const isPreview = previewAllowed(env);
  const hasTurnstileSecret = !!env.TURNSTILE_SECRET_KEY;

  if (!isPreview && !hasTurnstileSecret) {
    return json(
      { success: false, error: "Service temporarily unavailable. Please try again later." },
      503, request, env
    );
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const limit = await checkRateLimit(env, "subscribe:" + ip, 3, 30);
  if (!limit.allowed) {
    return json(
      { success: false, error: "Rate limit exceeded. Please try again later." },
      429, request, env,
      { "Retry-After": String(limit.retryAfter || 60) }
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let data;
  try {
    data = await readBody(request);
  } catch (e) {
    return json({ success: false, error: "Invalid request body." }, 400, request, env);
  }
  if (!data || typeof data !== "object") {
    return json({ success: false, error: "Invalid request body." }, 400, request, env);
  }

  // ── Honeypot ──────────────────────────────────────────────────────────────
  if (data.honeypot || data.website_url) {
    return json({ success: true }, 200, request, env);
  }

  // ── Turnstile token validation (when secret is configured) ────────────────
  if (hasTurnstileSecret) {
    const tsToken = data["cf-turnstile-response"] || data.turnstile_token;
    if (!tsToken) {
      return json(
        { success: false, error: "Verification required. Please complete the challenge." },
        403, request, env
      );
    }
    const ok = await verifyTurnstile(tsToken, env, ip);
    if (!ok) {
      return json(
        { success: false, error: "Verification failed. Please refresh and try again." },
        403, request, env
      );
    }
  }

  // ── Business logic ────────────────────────────────────────────────────────
  if (!env.SUBSCRIBERS_KV) {
    return json(
      { success: false, error: "Subscriptions are temporarily unavailable. Please try again later." },
      503, request, env
    );
  }

  const email = String(data.email || "").trim().toLowerCase().slice(0, 254);
  const sourceRaw = String(data.source || "footer").trim().toLowerCase().slice(0, 32);
  const source = ALLOWED_SOURCES.has(sourceRaw) ? sourceRaw : "unknown";

  if (!email || !isValidEmail(email)) {
    return json({ success: false, error: "Please provide a valid email address." }, 400, request, env);
  }

  let existing = null;
  try {
    const raw = await env.SUBSCRIBERS_KV.get(emailKey(email));
    if (raw) existing = JSON.parse(raw);
  } catch (e) { existing = null; }

  if (existing && existing.status === "confirmed") {
    return json({ success: true, already_confirmed: true, message: "You are already subscribed. Thank you." }, 200, request, env);
  }

  const token = genToken();
  const now = Date.now();
  const record = {
    email, status: "pending", source, token,
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    ip_hint: ip.slice(0, 64),
    country: request.cf && request.cf.country ? request.cf.country : "",
  };

  try {
    await env.SUBSCRIBERS_KV.put(emailKey(email), JSON.stringify(record));
    await env.SUBSCRIBERS_KV.put(tokenKey(token), email, { expirationTtl: 86400 });
  } catch (err) {
    return json({ success: false, error: "Could not save subscription. Please try again." }, 500, request, env);
  }

  const confirmUrl = siteOrigin(env) + "/api/subscribe/confirm?token=" + encodeURIComponent(token);

  await sendEmail(env, email, "Confirm your VJs TV subscription",
    emailTemplate("Almost there \u2014 confirm your email", `
      <p style="color:#fff;margin:0 0 12px 0;">Welcome to the VJs TV broadcast network.</p>
      <p>Click below to confirm your subscription. You'll then receive a link to download <strong style="color:#fff;">VJs TV Loops 01</strong> \u2014 18 free seamlessly looping clips, royalty-free for commercial use.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${confirmUrl}" style="display:inline-block;background:#9d00ff;color:#fff;text-decoration:none;padding:14px 28px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:13px;">Confirm Subscription</a>
      </div>
      <p style="color:#666;font-size:12px;">Or paste into your browser:<br><span style="color:#9d00ff;word-break:break-all;">${confirmUrl}</span></p>
      <p style="color:#666;font-size:12px;margin-top:24px;">If you did not request this, ignore this email — it expires automatically in 24 hours.</p>
    `)
  );

  return json({ success: true, pending: true, message: "Check your inbox to confirm your subscription." }, 202, request, env);
}
