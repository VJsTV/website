import { applyMiddleware } from "../functions/_middleware.js";
import { handle as handleHealth } from "../functions/api/health.js";
import { handle as handleSubmit } from "../functions/api/submit.js";
import { handle as handleBooking } from "../functions/api/booking.js";
import { handle as handlePartner } from "../functions/api/partner.js";
import { handle as handleReport } from "../functions/api/report.js";
import { handle as handleAnalytics } from "../functions/api/analytics.js";
import { handle as handleAnalyticsCharts } from "../functions/api/analytics/charts.js";
import { handle as handleSubscribe } from "../functions/api/subscribe.js";
import { handle as handleSubscribeConfirm } from "../functions/api/subscribe/confirm.js";
import {
  handleOptions as handleCheckoutOptions,
  handlePost as handleCheckoutPost,
} from "../functions/api/checkout/create-session.js";
import { handlePost as handleCheckoutWebhook } from "../functions/api/checkout/webhook.js";
import { handleGet as handleStreamStatus, handleOptions as handleStreamOptions } from "../functions/api/stream/status.js";
import { handlePost as handleStreamHeartbeat } from "../functions/api/stream/heartbeat.js";

const API_ROUTES = {
  "/api/health": { default: handleHealth },
  "/api/submit": { default: handleSubmit },
  "/api/booking": { default: handleBooking },
  "/api/partner": { default: handlePartner },
  "/api/report": { default: handleReport },
  "/api/analytics": { default: handleAnalytics },
  "/api/analytics/charts": { default: handleAnalyticsCharts },
  "/api/subscribe": { default: handleSubscribe },
  "/api/subscribe/confirm": { default: handleSubscribeConfirm },
  "/api/checkout/create-session": {
    OPTIONS: handleCheckoutOptions,
    POST: handleCheckoutPost,
  },
  "/api/checkout/webhook": { POST: handleCheckoutWebhook },
  "/api/stream/status": {
    GET: handleStreamStatus,
    OPTIONS: handleStreamOptions,
  },
  "/api/stream/heartbeat": { POST: handleStreamHeartbeat },
};

const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "interest-cohort=(), geolocation=(), microphone=(), camera=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.youtube-nocookie.com https://player.vimeo.com https://challenges.cloudflare.com https://static.cloudflareinsights.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://plausible.io; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; font-src 'self' https://fonts.gstatic.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://challenges.cloudflare.com; connect-src 'self' https://vimeo.com https://player.vimeo.com https://www.youtube.com https://cloudflareinsights.com https://challenges.cloudflare.com https://plausible.io; media-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};

function isExcludedByPagesRoutes(pathname) {
  return pathname.startsWith("/assets/")
    || pathname === "/favicon.ico"
    || pathname === "/robots.txt"
    || pathname === "/sitemap.xml"
    || pathname === "/feed.xml"
    || pathname.startsWith("/schedule/");
}

function applyHeaders(response, pathname) {
  const headers = new Headers(response.headers);

  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => {
    headers.set(name, value);
  });

  if (pathname === "/sitemap.xml") {
    headers.set("Content-Type", "application/xml; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=3600");
  } else if (pathname === "/robots.txt") {
    headers.set("Content-Type", "text/plain; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=86400");
  } else if (/\.(css|js|png|jpg|webp|avif|svg|woff2)$/.test(pathname)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function dispatchApi(request, env) {
  const pathname = new URL(request.url).pathname;
  const route = API_ROUTES[pathname];

  if (!route) {
    return new Response("Not Found", { status: 404 });
  }

  const handler = route[request.method] || route.default;
  if (!handler) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  return handler(request, env);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const next = () => pathname.startsWith("/api/")
      ? dispatchApi(request, env)
      : env.ASSETS.fetch(request);

    const response = isExcludedByPagesRoutes(pathname)
      ? await next()
      : await applyMiddleware({ request, env, next });

    return applyHeaders(response, pathname);
  },
};