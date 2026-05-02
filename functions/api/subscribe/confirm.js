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

  if (record.status !== "confirmed") {
    record.status = "confirmed";
    record.confirmed_at = Date.now();
    record.updated_at = Date.now();
    try {
      await env.SUBSCRIBERS_KV.put(emailKey(email), JSON.stringify(record));
    } catch (e) { /* best-effort */ }

    // Mirror to Resend audience if configured. Best-effort, do not block redirect.
    await mirrorToResend(env, email);
  }

  // Burn the token so it can't be reused.
  try { await env.SUBSCRIBERS_KV.delete(tokenKey(token)); } catch (e) {}

  return redirect(origin + "/thank-you/subscribe/?status=confirmed", 302);
}
