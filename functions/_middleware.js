/**
 * VJs TV Pages Middleware
 *
 * Responsibilities:
 *   1. Sticky A/B variant assignment via `vjs-exp` cookie + KV persistence.
 *      - On first visit (no cookie), assigns A/B 50/50 via crypto RNG.
 *        Bots always get variant A (control) and are never written to KV.
 *      - Assignment is stored in AB_TEST_KV (when bound) under a visitor
 *        key derived from CF-Connecting-IP + User-Agent hash. This lets
 *        Plausible breakdowns be cross-referenced against KV-aggregated
 *        variant counts for funnel-level lift measurement independent of
 *        browser storage clearing.
 *      - Cookie (HttpOnly:false, SameSite:Lax, 30d) provides in-browser
 *        stickiness for the duration of the experiment without a server
 *        round-trip on subsequent page loads.
 *      - The active variant is injected into HTML responses as
 *        `<meta name="vjs-exp" content="A|B">` so client JS can render
 *        the matching variant and attach it to every Plausible event as
 *        a custom property (see _includes/utilities/track.html).
 *   2. Skips /api/* routes entirely — Pages Functions there must be
 *      reachable without HTML rewriting.
 *
 * KV schema (AB_TEST_KV):
 *   "vis:<fingerprint>"  → { variant, first_seen, last_seen, page_count }
 *                          TTL 31 days (refreshed on each new assignment)
 *   "count:<variant>"   → integer string, incremented on each new assignment
 *                          No TTL — aggregate for the life of the experiment.
 */

const BOT_UA = /(bot|crawl|spider|slurp|bingpreview|googlebot|facebookexternalhit|whatsapp|telegrambot|linkedinbot|pingdom|uptimerobot|ahrefs|semrush)/i;

function readVariantCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/(?:^|;\s*)vjs-exp=(A|B)/);
  return m ? m[1] : null;
}

function assignVariant() {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return buf[0] < 128 ? "A" : "B";
}

/**
 * Build a stable, privacy-safe fingerprint for the visitor.
 * We use CF-Connecting-IP + a truncated UA hash — not uniquely identifying
 * but sufficient for experiment cohort assignment.
 */
async function visitorKey(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ua = (request.headers.get("User-Agent") || "").slice(0, 120);
  const raw = ip + "|" + ua;
  try {
    const enc = new TextEncoder().encode(raw);
    const hash = await crypto.subtle.digest("SHA-256", enc);
    const hex = Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
    return "vis:" + hex;
  } catch (e) {
    return "vis:" + ip.replace(/[^a-z0-9]/gi, "_");
  }
}

/**
 * Persist assignment to KV: update visitor record and increment global counter.
 * Best-effort — KV errors never block the response.
 */
async function persistAssignment(kv, key, variant, now) {
  try {
    const [existing, countRaw] = await Promise.all([
      kv.get(key, { type: "json" }).catch(() => null),
      kv.get("count:" + variant).catch(() => null),
    ]);

    const record = existing || { variant, first_seen: now, last_seen: now, page_count: 0 };
    record.last_seen = now;
    record.page_count = (record.page_count || 0) + 1;
    if (!record.variant) record.variant = variant;

    const newCount = (parseInt(countRaw || "0", 10) || 0) + (existing ? 0 : 1);

    await Promise.all([
      kv.put(key, JSON.stringify(record), { expirationTtl: 31 * 86400 }),
      // Only increment global count on new assignments (no prior record).
      existing ? Promise.resolve() : kv.put("count:" + variant, String(newCount)),
    ]);
  } catch (e) { /* never block the response */ }
}

class VjsExpMetaInjector {
  constructor(variant) {
    this.variant = variant;
    this.injected = false;
  }
  element(element) {
    if (this.injected) return;
    this.injected = true;
    element.append('<meta name="vjs-exp" content="' + this.variant + '">', { html: true });
  }
}

export async function onRequest(context) {
  const { request, next, env } = context;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return next();
  }

  // Pass API routes through untouched.
  if (url.pathname.startsWith("/api/")) return next();

  const ua = request.headers.get("User-Agent") || "";
  const isBot = BOT_UA.test(ua);

  const cookieHeader = request.headers.get("Cookie") || "";
  let variant = readVariantCookie(cookieHeader);
  let isNewAssignment = false;
  let setCookie = null;

  if (!variant && !isBot) {
    variant = assignVariant();
    isNewAssignment = true;
    setCookie = "vjs-exp=" + variant + "; Path=/; Max-Age=2592000; SameSite=Lax";
  }
  if (!variant) variant = "A"; // bots + unassigned: always control

  // KV persistence — non-blocking, fire-and-forget.
  if (!isBot && env && env.AB_TEST_KV) {
    const vKey = await visitorKey(request);
    // Always update page_count on each request; only increment global count on new assignment.
    persistAssignment(env.AB_TEST_KV, vKey, variant, Date.now());
  }

  const response = await next();
  const ct = response.headers.get("Content-Type") || "";

  if (!ct.includes("text/html")) {
    if (setCookie) response.headers.append("Set-Cookie", setCookie);
    return response;
  }

  const rewritten = new HTMLRewriter()
    .on("head", new VjsExpMetaInjector(variant))
    .transform(response);

  if (setCookie) rewritten.headers.append("Set-Cookie", setCookie);
  const existingVary = rewritten.headers.get("Vary");
  rewritten.headers.set("Vary", existingVary ? existingVary + ", Cookie" : "Cookie");
  return rewritten;
}
