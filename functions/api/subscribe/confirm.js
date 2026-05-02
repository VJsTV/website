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

/**
 * Sync a confirmed subscriber to Resend audience.
 *
 * This is the PRIMARY ESP list integration — when RESEND_API_KEY and
 * RESEND_AUDIENCE_ID are configured, every confirmed subscriber is written
 * to the Resend audience so broadcasted emails reach them. If either env var
 * is absent the function logs a warning and resolves (graceful degradation
 * during local dev / before ESP is wired); in production both MUST be set.
 */
async function mirrorToResend(env, email) {
  if (!env || !env.RESEND_API_KEY) {
    console.warn("[subscribe/confirm] RESEND_API_KEY not set — subscriber NOT synced to ESP audience:", email);
    return { skipped: true };
  }
  const audienceId = env.RESEND_AUDIENCE_ID || "";
  if (!audienceId) {
    console.warn("[subscribe/confirm] RESEND_AUDIENCE_ID not set — subscriber NOT synced to ESP audience:", email);
    return { skipped: true };
  }
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
    if (!res.ok) {
      console.error("[subscribe/confirm] Resend audience sync failed:", res.status, email);
    }
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.error("[subscribe/confirm] Resend audience sync threw:", err && err.message, email);
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

    // ── ESP audience sync — REQUIRED in production ───────────────────────────
    // mirrorToResend is the primary ESP list write. It logs a warning when env
    // vars are absent (acceptable during local dev/preview) but is expected to
    // succeed in production. The function itself never throws — errors are logged
    // and the confirmation redirect always completes.
    await mirrorToResend(env, email);

    // ── Welcome email via SEB (Cloudflare Email Routing) ─────────────────────
    // SEB is REQUIRED in production. If absent, the subscriber is confirmed in
    // KV but will NOT receive their download link. Bind SEB under:
    //   Cloudflare Pages → Settings → Functions → Email bindings
    const { sendEmail, emailTemplate } = await import("../../_lib/email.js");
    if (!env.SEB) {
      console.error("[subscribe/confirm] SEB email binding is not configured — welcome email not sent for:", email);
    }
    const downloadUrl = origin + "/marketplace/vjstv-loops-01";
    const emailResult = await sendEmail(
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
    if (emailResult !== true) {
      console.error("[subscribe/confirm] Welcome email send failed for:", email, "— check SEB binding and noreply@vjstv.com routing rule.");
    }
  }

  // Burn the token so it can't be reused.
  try { await env.SUBSCRIBERS_KV.delete(tokenKey(token)); } catch (e) {}

  const qs = isNewConfirm ? "?status=confirmed" : "?status=already_confirmed";
  return redirect(origin + "/thank-you/subscribe/" + qs, 302);
}
