import { json } from "../_lib/json.js";
import { guardPost } from "../_lib/guard.js";
import { sendEmail, emailTemplate } from "../_lib/email.js";
import { isValidEmail } from "../_lib/validation.js";

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
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function emailKey(email) {
  return "sub:" + String(email).trim().toLowerCase();
}

function tokenKey(token) {
  return "sub-token:" + token;
}

async function mirrorToResend(env, email, source) {
  if (!env || !env.RESEND_API_KEY) return { skipped: true };
  const audienceId = env.RESEND_AUDIENCE_ID || "";
  if (!audienceId) return { skipped: true, reason: "no audience id" };
  try {
    const res = await fetch(
      "https://api.resend.com/audiences/" + encodeURIComponent(audienceId) + "/contacts",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.RESEND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email,
          unsubscribed: false,
          first_name: "",
          last_name: "",
        }),
      }
    );
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  const guard = await guardPost(request, env, { endpoint: "subscribe", perMinute: 3, perDay: 30 });
  if (guard.response) return guard.response;
  const data = guard.data;

  if (!env.SUBSCRIBERS_KV) {
    return json({
      success: false,
      error: "Subscriptions are temporarily unavailable. Please try again later.",
    }, 503, request, env);
  }

  const email = String(data.email || "").trim().toLowerCase().slice(0, 254);
  const sourceRaw = String(data.source || "footer").trim().toLowerCase().slice(0, 32);
  const source = ALLOWED_SOURCES.has(sourceRaw) ? sourceRaw : "unknown";

  if (!email || !isValidEmail(email)) {
    return json({ success: false, error: "Please provide a valid email address." }, 400, request, env);
  }

  // Idempotent: if we already have a confirmed subscriber, do not re-send.
  let existing = null;
  try {
    const raw = await env.SUBSCRIBERS_KV.get(emailKey(email));
    if (raw) existing = JSON.parse(raw);
  } catch (e) { existing = null; }

  if (existing && existing.status === "confirmed") {
    return json({
      success: true,
      already_confirmed: true,
      message: "You are already subscribed. Thank you.",
    }, 200, request, env);
  }

  const token = genToken();
  const now = Date.now();
  const record = {
    email: email,
    status: "pending",
    source: source,
    token: token,
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    ip_hint: (request.headers.get("CF-Connecting-IP") || "").slice(0, 64),
    country: request.cf && request.cf.country ? request.cf.country : "",
  };

  try {
    await env.SUBSCRIBERS_KV.put(emailKey(email), JSON.stringify(record));
    // Token lookup for confirm step (24h to confirm).
    await env.SUBSCRIBERS_KV.put(tokenKey(token), email, { expirationTtl: 86400 });
  } catch (err) {
    return json({ success: false, error: "Could not save subscription. Please try again." }, 500, request, env);
  }

  const confirmUrl = siteOrigin(env) + "/api/subscribe/confirm?token=" + encodeURIComponent(token);

  // Welcome / confirm email via Cloudflare Email Routing (env.SEB).
  await sendEmail(
    env,
    email,
    "Confirm your VJs TV subscription",
    emailTemplate("Almost there \u2014 confirm your email", `
      <p style="color:#fff;margin:0 0 12px 0;">Welcome to the VJs TV broadcast network.</p>
      <p>Click the button below to confirm your subscription. You'll then receive a link to download <strong style="color:#fff;">VJs TV Loops 01</strong> \u2014 18 free seamlessly looping clips, royalty-free for commercial use.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${confirmUrl}" style="display:inline-block;background:#9d00ff;color:#fff;text-decoration:none;padding:14px 28px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:13px;">Confirm Subscription</a>
      </div>
      <p style="color:#666;font-size:12px;">Or paste this link into your browser:<br><span style="color:#9d00ff;word-break:break-all;">${confirmUrl}</span></p>
      <p style="color:#666;font-size:12px;margin-top:24px;">If you did not request this, you can safely ignore this email \u2014 the request will expire automatically in 24 hours.</p>
    `)
  );

  return json({
    success: true,
    pending: true,
    message: "Check your inbox to confirm your subscription.",
  }, 202, request, env);
}
