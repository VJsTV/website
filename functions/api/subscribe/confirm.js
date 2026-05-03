import { previewAllowed } from "../../_lib/cors.js";

function siteOrigin(env, request) {
  if (env && env.SITE_ORIGIN) return String(env.SITE_ORIGIN).replace(/\/+$/, "");
  try {
    return new URL(request.url).origin;
  } catch (e) {
    return "https://vjstv.com";
  }
}

function emailKey(email) { return "sub:" + String(email).trim().toLowerCase(); }
function tokenKey(token) { return "sub-token:" + token; }

function redirect(url) {
  return new Response(null, {
    status: 302,
    headers: { "Location": url, "Cache-Control": "no-store" },
  });
}

async function syncToResend(env, email) {
  const res = await fetch(
    "https://api.resend.com/audiences/" + encodeURIComponent(env.RESEND_AUDIENCE_ID) + "/contacts",
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, unsubscribed: false }),
    }
  );
  if (!res.ok) console.error("[confirm] Resend sync failed:", res.status, email);
  return res.ok;
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = siteOrigin(env, request);
  const isPreview = previewAllowed(env);

  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!env.SUBSCRIBERS_KV) {
    return redirect(origin + "/thank-you/subscribe/?status=error&reason=unavailable");
  }

  if (!isPreview && (!env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID)) {
    return redirect(origin + "/thank-you/subscribe/?status=error&reason=esp_not_configured");
  }

  let token = "";
  try {
    token = (new URL(request.url).searchParams.get("token") || "").trim().slice(0, 128);
  } catch (e) {
    return redirect(origin + "/thank-you/subscribe/?status=error&reason=badtoken");
  }

  if (!token || !/^[a-f0-9]{8,}$/i.test(token)) {
    return redirect(origin + "/thank-you/subscribe/?status=error&reason=badtoken");
  }

  let email = null;
  try {
    email = await env.SUBSCRIBERS_KV.get(tokenKey(token));
  } catch (e) { email = null; }

  if (!email) {
    return redirect(origin + "/thank-you/subscribe/?status=expired");
  }

  let record = null;
  try {
    const raw = await env.SUBSCRIBERS_KV.get(emailKey(email));
    if (raw) record = JSON.parse(raw);
  } catch (e) { record = null; }

  if (!record) {
    return redirect(origin + "/thank-you/subscribe/?status=expired");
  }

  const isNewConfirm = record.status !== "confirmed";
  if (isNewConfirm) {
    record.status = "confirmed";
    record.confirmed_at = Date.now();
    record.updated_at = Date.now();
    try {
      await env.SUBSCRIBERS_KV.put(emailKey(email), JSON.stringify(record));
    } catch (e) { /* best-effort */ }

    if (env.RESEND_API_KEY && env.RESEND_AUDIENCE_ID) {
      await syncToResend(env, email);
    }

    const { sendEmail, emailTemplate } = await import("../../_lib/email.js");
    if (!env.SEB) console.error("[confirm] SEB not set — welcome email skipped:", email);
    const assetUrl = "https://assets.vjstv.com/downloads/vjstv-loops-01.zip";
    const downloadUrl = origin + "/thank-you/download/?url=" + encodeURIComponent(assetUrl) + "&pack=" + encodeURIComponent("VJs TV Loops 01") + "&source=welcome-email";
    const ok = await sendEmail(
      env,
      email,
      "You\u2019re in \u2014 download your free VJs TV loop pack",
      emailTemplate("Your free loops are ready to download", `
        <p style="color:#fff;margin:0 0 12px 0;">Welcome to the VJs TV broadcast network.</p>
        <p>Your subscription is confirmed. Click below to get your <strong style="color:#fff;">18 free, royalty-free loop clips</strong> \u2014 seamlessly looping, commercial use included, works in Resolume, TouchDesigner, VDMX, and every major VJ platform.</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${downloadUrl}" style="display:inline-block;background:#9d00ff;color:#fff;text-decoration:none;padding:14px 28px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:13px;">Download VJs TV Loops 01</a>
        </div>
        <p>While the pack downloads, a few things worth doing:</p>
        <ul style="color:#999;padding-left:20px;line-height:2;">
          <li><a href="https://www.instagram.com/vjstvcom/" style="color:#9d00ff;">Follow @vjstvcom on Instagram</a> \u2014 new loops and artist features every week</li>
          <li><a href="${origin}/submit" style="color:#00f9ff;">Submit your own work</a> \u2014 get listed in the global VJ directory</li>
          <li><a href="${origin}/artists" style="color:#9d00ff;">Browse the Artist Directory</a> \u2014 working VJs from 50+ countries</li>
        </ul>
        <p style="color:#666;font-size:12px;margin-top:24px;">You\u2019re receiving this because you subscribed at vjstv.com. To unsubscribe, reply to this email.</p>
      `)
    );
    if (ok !== true) console.error("[confirm] Welcome email failed:", email);
  }

  try { await env.SUBSCRIBERS_KV.delete(tokenKey(token)); } catch (e) {}

  const qs = isNewConfirm ? "?status=confirmed" : "?status=already_confirmed";
  return redirect(origin + "/thank-you/subscribe/" + qs);
}
