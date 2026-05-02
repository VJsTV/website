function siteOrigin(env, request) {
  if (env && env.SITE_ORIGIN) return String(env.SITE_ORIGIN).replace(/\/+$/, "");
  try {
    const u = new URL(request.url);
    return u.origin;
  } catch (e) {
    return "https://vjstv.com";
  }
}

function emailKey(email) {
  return "sub:" + String(email).trim().toLowerCase();
}

function tokenKey(token) {
  return "sub-token:" + token;
}

async function mirrorToResend(env, email) {
  if (!env || !env.RESEND_API_KEY) return { skipped: true };
  const audienceId = env.RESEND_AUDIENCE_ID || "";
  if (!audienceId) return { skipped: true };
  try {
    const res = await fetch(
      "https://api.resend.com/audiences/" + encodeURIComponent(audienceId) + "/contacts",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.RESEND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email, unsubscribed: false }),
      }
    );
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false };
  }
}

function redirect(url, status) {
  return new Response(null, {
    status: status || 302,
    headers: { "Location": url, "Cache-Control": "no-store" },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = siteOrigin(env, request);

  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!env.SUBSCRIBERS_KV) {
    return redirect(origin + "/thank-you/subscribe/?status=error&reason=unavailable", 302);
  }

  let token = "";
  try {
    const u = new URL(request.url);
    token = (u.searchParams.get("token") || "").trim().slice(0, 128);
  } catch (e) {
    return redirect(origin + "/thank-you/subscribe/?status=error&reason=badtoken", 302);
  }

  if (!token || !/^[a-f0-9]{8,}$/i.test(token)) {
    return redirect(origin + "/thank-you/subscribe/?status=error&reason=badtoken", 302);
  }

  let email = null;
  try {
    email = await env.SUBSCRIBERS_KV.get(tokenKey(token));
  } catch (e) {
    email = null;
  }

  if (!email) {
    return redirect(origin + "/thank-you/subscribe/?status=expired", 302);
  }

  let record = null;
  try {
    const raw = await env.SUBSCRIBERS_KV.get(emailKey(email));
    if (raw) record = JSON.parse(raw);
  } catch (e) { record = null; }

  if (!record) {
    return redirect(origin + "/thank-you/subscribe/?status=expired", 302);
  }

  const isNewConfirm = record.status !== "confirmed";
  if (isNewConfirm) {
    record.status = "confirmed";
    record.confirmed_at = Date.now();
    record.updated_at = Date.now();
    try {
      await env.SUBSCRIBERS_KV.put(emailKey(email), JSON.stringify(record));
    } catch (e) { /* best-effort */ }

    // Mirror to Resend audience if configured. Best-effort, do not block redirect.
    await mirrorToResend(env, email);

    // Post-confirmation welcome email with the free loop pack download link.
    const { sendEmail, emailTemplate } = await import("../../_lib/email.js");
    const downloadUrl = origin + "/marketplace/vjstv-loops-01";
    await sendEmail(
      env,
      email,
      "You\u2019re in \u2014 download your free VJs TV loop pack",
      emailTemplate("Your free loops are ready to download", `
        <p style="color:#fff;margin:0 0 12px 0;">Welcome to the VJs TV broadcast network.</p>
        <p>Your subscription is confirmed. Click below to get your <strong style="color:#fff;">18 free, royalty-free loop clips</strong> \u2014 seamlessly looping, commercial use included, works in Resolume, TouchDesigner, VDMX, and every major VJ platform.</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${downloadUrl}" style="display:inline-block;background:#9d00ff;color:#fff;text-decoration:none;padding:14px 28px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:13px;">Download VJs TV Loops 01</a>
        </div>
        <p>While you explore the pack, here are a few things worth bookmarking:</p>
        <ul style="color:#999;padding-left:20px;line-height:2;">
          <li><a href="${origin}/artists" style="color:#9d00ff;">Artist Directory</a> \u2014 discover working VJs from 50+ countries</li>
          <li><a href="${origin}/live" style="color:#00f9ff;">Live Channels</a> \u2014 CH.1 live, CH.2 loop gallery, CH.3 education</li>
          <li><a href="${origin}/marketplace" style="color:#9d00ff;">Loop Marketplace</a> \u2014 more packs, all royalty-free</li>
        </ul>
        <p style="color:#666;font-size:12px;margin-top:24px;">You\u2019re receiving this because you subscribed at vjstv.com. To unsubscribe, reply to this email.</p>
      `)
    );
  }

  // Burn the token so it can't be reused.
  try { await env.SUBSCRIBERS_KV.delete(tokenKey(token)); } catch (e) {}

  const qs = isNewConfirm ? "?status=confirmed" : "?status=already_confirmed";
  return redirect(origin + "/thank-you/subscribe/" + qs, 302);
}
