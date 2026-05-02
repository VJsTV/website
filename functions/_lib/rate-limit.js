export async function checkRateLimit(env, key, perMinute, perDay) {
  if (!env || !env.RATE_LIMIT_KV) {
    return { allowed: true, remaining: -1 };
  }

  const now = Math.floor(Date.now() / 1000);
  const minuteWindow = Math.floor(now / 60);
  const dayWindow = Math.floor(now / 86400);
  const minuteKey = "rl:m:" + key + ":" + minuteWindow;
  const dayKey = "rl:d:" + key + ":" + dayWindow;

  try {
    const [minRaw, dayRaw] = await Promise.all([
      env.RATE_LIMIT_KV.get(minuteKey),
      env.RATE_LIMIT_KV.get(dayKey),
    ]);

    const minCount = (parseInt(minRaw, 10) || 0) + 1;
    const dayCount = (parseInt(dayRaw, 10) || 0) + 1;

    if (perMinute && minCount > perMinute) {
      return { allowed: false, retryAfter: 60 - (now % 60), reason: "per-minute" };
    }
    if (perDay && dayCount > perDay) {
      return { allowed: false, retryAfter: 86400 - (now % 86400), reason: "per-day" };
    }

    await Promise.all([
      env.RATE_LIMIT_KV.put(minuteKey, String(minCount), { expirationTtl: 120 }),
      env.RATE_LIMIT_KV.put(dayKey, String(dayCount), { expirationTtl: 90000 }),
    ]);

    return { allowed: true, remaining: perMinute ? perMinute - minCount : -1 };
  } catch (err) {
    return { allowed: true, remaining: -1, kvError: true };
  }
}
