/**
 * VJs TV Pages Middleware
 *
 * Responsibilities:
 *   1. Sticky A/B variant assignment via the `vjs-exp` cookie.
 *      - Cookie is HttpOnly:false, Lax, 30 days. Generated 50/50 random
 *        when missing, NEVER assigned to bots.
 *      - The active variant is injected into HTML responses as
 *        `<meta name="vjs-exp" content="A|B">` so client JS can render
 *        the matching variant and Plausible can attach it as a custom
 *        property on every event (see _includes/utilities/track.html).
 *   2. Skips API routes — Pages Functions on /api/* must be reachable
 *      without HTML rewriting.
 *
 * This middleware runs on every request that is NOT served by a more
 * specific function. It is intentionally minimal — there is no KV
 * dependency: variant assignment is sticky-by-cookie which is enough
 * for funnel-level lift measurement; deeper stratification can be
 * layered on later via Plausible's per-property breakdowns.
 */

const BOT_UA = /(bot|crawl|spider|slurp|bingpreview|googlebot|facebookexternalhit|whatsapp|telegrambot|linkedinbot|pingdom|uptimerobot|ahrefs|semrush)/i;

function readVariantCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/(?:^|;\s*)vjs-exp=(A|B)/);
  return m ? m[1] : null;
}

function assignVariant() {
  // Use crypto for an unbiased coin flip.
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return buf[0] < 128 ? "A" : "B";
}

class VjsExpMetaInjector {
  constructor(variant) {
    this.variant = variant;
    this.injected = false;
  }
  element(element) {
    if (this.injected) return;
    this.injected = true;
    const tag = '<meta name="vjs-exp" content="' + this.variant + '">';
    element.append(tag, { html: true });
  }
}

export async function onRequest(context) {
  const { request, next } = context;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return next();
  }

  // Never touch API responses or asset bytes — let them pass through.
  if (url.pathname.startsWith("/api/")) return next();

  const ua = request.headers.get("User-Agent") || "";
  const isBot = BOT_UA.test(ua);

  const cookieHeader = request.headers.get("Cookie") || "";
  let variant = readVariantCookie(cookieHeader);
  let setCookie = null;

  if (!variant && !isBot) {
    variant = assignVariant();
    // 30 days. Lax keeps it on top-level navigations; HttpOnly off so the
    // client meta tag and Plausible custom prop can read the same value
    // (we already inject the variant via HTMLRewriter; cookie stays for
    // stickiness only).
    setCookie = "vjs-exp=" + variant + "; Path=/; Max-Age=2592000; SameSite=Lax";
  }
  if (!variant) variant = "A"; // bots and unassigned: always control variant

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
  // Vary on cookie so caches respect per-variant content if any caching
  // is layered on later.
  const existingVary = rewritten.headers.get("Vary");
  rewritten.headers.set("Vary", existingVary ? existingVary + ", Cookie" : "Cookie");
  return rewritten;
}
