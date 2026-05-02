const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Verifies a Turnstile token against env.TURNSTILE_SECRET_KEY.
// Fail-closed: if the secret is missing or the token is missing/invalid,
// returns false. The decision of whether the secret is REQUIRED for a
// given environment is made in guard.js, not here.
export async function verifyTurnstile(token, env, ip) {
  if (!env || !env.TURNSTILE_SECRET_KEY) return false;
  if (!token || typeof token !== "string") return false;

  try {
    const body = new URLSearchParams();
    body.append("secret", env.TURNSTILE_SECRET_KEY);
    body.append("response", token);
    if (ip) body.append("remoteip", ip);

    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 5000);

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json();
    return data && data.success === true;
  } catch (err) {
    return false;
  }
}
