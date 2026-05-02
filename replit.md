# VJs TV - Global Broadcast Network for VJ Culture

## Overview
VJs TV is a Jekyll-based platform dedicated to VJ culture and audiovisual performances. It serves as the broadcasting, discovery, and project infrastructure layer, complementing VJSMag (vjsmag.com) which focuses on editorial content. The project aims to be a central hub for VJ artists, projects, events, and technology, offering a dynamic and interactive experience for the VJ community.

## User Preferences
I prefer clear and concise communication. When making changes, prioritize high-level architectural improvements over minor code tweaks. For significant modifications, please ask for confirmation before proceeding. Ensure all explanations are direct and focused on the impact on the system.

## System Architecture
VJs TV is built with Ruby 3.2 and Jekyll 4.3.x, leveraging a static site generation approach. The UI/UX features an NTS.live-inspired dark cyberpunk design with a flat aesthetic, 0px border-radius, dense layouts, #050505 black, and ultraviolet/cyan/magenta accents. Fonts include Barlow Condensed and Orbitron.

The site is structured around several Jekyll collections:
- `_vjs/`: VJ artist profiles
- `_projects/`: Audiovisual projects
- `_events/`: Events and performances
- `_studios/`: Studios and installations
- `_technology/`: VJ technology and tools
- `_sponsors/`: Sponsors and brand partners

Key pages include:
- **Homepage (`/`)**: Features a live broadcast strip (CH.1/CH.2 sourced from `site.events` filtered by `event_type: "Live Stream"`, matching the live page schedule) with clickable stat counters (Projects, Events, Studios, Countries) in distinct colors (ultraviolet, cyan, magenta, gradient) auto-calculated from Jekyll collections. Below: full-bleed hero section, VJs TV Picks, sponsor ticker, animated stats bar, and various content grids. CSS cache-busting via `?v={{site.time | date: '%s'}}` on vjstv.css.
- **Live Broadcast Page (`/live`)**: Offers three channels (CH.1 LIVE, CH.2 LOOP GALLERY, CH.3 VJ EDUCATION) with dynamic programming, Vimeo-powered loop galleries, and a cinema mode.
- **Directory Pages (`/artists`, `/projects`, `/events`, `/studios`, `/technology`, `/sponsors`)**: Provide filtered and sortable listings of content.
- **Utility Pages (`/search`, `/submit`, `/partners`)**: Client-side search, project submission form, and a sponsor pitch page with interactive elements and real-time analytics.

A branded preloader screen is implemented in `_layouts/default.html` with inline critical CSS in `_includes/core/styles/styles.html`. It shows a gradient "VJs TV" logo with an animated progress bar on a dark background, preventing any flash of unstyled content (FOUC). The preloader fades out via `assets/js/scripts.js` on document ready, with a `window.load` fallback and a 6-second safety timeout in `_includes/core/scripts/scripts.html`.

Accessibility features include skip-to-content links, `:focus-visible` outlines, ARIA labels, and `prefers-reduced-motion` support. SEO is a core focus, implemented through canonical URLs, meta robots tags, XML/HTML sitemaps, comprehensive JSON-LD structured data for various content types, dynamic meta descriptions, Open Graph, Twitter Cards, and strict heading hierarchy. Performance is optimized with `requestAnimationFrame` throttling, passive scroll listeners, `will-change` hints, `IntersectionObserver`, `preconnect`/`dns-prefetch`/`preload` for critical assets, `defer` for non-critical scripts, and runtime lazy loading.

### API architecture (post Task #1 consolidation)
The API is now a single, same-origin surface served by Cloudflare Pages Functions:

- `functions/api/submit.js` — project submissions
- `functions/api/booking.js` — artist/studio/project enquiries
- `functions/api/partner.js` — sponsorship & partnership enquiries
- `functions/api/report.js` — project issue reports
- `functions/api/analytics.js` — monthly visitor counter
- `functions/api/analytics/charts.js` — daily uniques + top countries
- `functions/api/health.js` — health probe

All endpoints share `functions/_lib/`:
`cors.js` (allowlist), `json.js`, `guard.js` (CORS+rate-limit+Turnstile+honeypot pipeline), `turnstile.js`, `rate-limit.js` (KV-backed, per-IP per-minute & per-day), `validation.js` (input sanitisation, video-host allowlist for Vimeo/YouTube only, RFC-ish email check, LLM input scrubber), `github.js` (issue creation with timeout), `email.js` (CRLF-stripping MIME builder), `moderation.js` (Workers AI w/ prompt-injection guard; failures fall through with `needsReview`), `country-names.js`.

`_routes.json` lists only the seven endpoints above so static assets bypass the function runtime. The legacy monolithic `functions/worker.js` was deleted; `site.api_url` is now empty so the front-end calls relative `/api/*` paths.

The local Express server in `api/server.js` only serves the static Jekyll build, the preview gzip/CSP headers, `/api/health`, and `/api/yt-info` (a YouTube oEmbed proxy used by the live page). It does **not** re-implement submit/booking/partner/report — those are exercised against a Cloudflare Pages dev server or production. Run `./scripts/smoke-api.sh https://vjstv.com` (or any base URL) to validate the full surface.

### Required Cloudflare Pages bindings & secrets
Configure these in the Pages project so the functions behave correctly:

- `GITHUB_TOKEN` — secret, scoped repo write access to `VJsTV/website` issues (Pages Function only, never exposed to the browser).
- `RATE_LIMIT_KV` — KV namespace binding used by `_lib/rate-limit.js`. If absent, rate limiting silently no-ops.
- `AI` — Workers AI binding for content moderation. If absent, moderation is skipped and items are accepted; if the model errors, items are tagged `needs-review`.
- `SEB` — Send-Email binding (Cloudflare Email Routing) for the booking confirmation receipt; optional.
- `CF_API_TOKEN`, `CF_ZONE_ID` — for `/api/analytics` and `/api/analytics/charts`.
- `TURNSTILE_SECRET_KEY` — secret. When present, every POST endpoint requires a valid `cf-turnstile-response` token. The matching site key goes into `_config.yml → turnstile_site_key`; both must be set together.
- `ALLOWED_ORIGINS` — optional comma-separated list. Defaults to `https://vjstv.com,https://www.vjstv.com`. Preview/local origins (`*.pages.dev`, `localhost`, `127.0.0.1`) are **only** accepted when `ALLOW_PREVIEW_ORIGINS=1` is also set on the environment — production should leave it unset.
- `ALLOW_PREVIEW_ORIGINS` — set to `1` only on Pages preview/dev environments to permit `*.pages.dev` and localhost callers, **and** to allow form POSTs to run without a Turnstile secret. Never set on production. When this flag is unset (production-like) and `TURNSTILE_SECRET_KEY` is missing, every POST endpoint returns `503 Service Temporarily Unavailable` — fail-closed by design.

### Rate limits and success codes
- All form endpoints (`/api/submit`, `/api/booking`, `/api/partner`, `/api/report`) enforce a uniform **5 requests / minute** and **50 requests / day** per IP via `functions/_lib/guard.js`. Exceeded limits return `429` with a `Retry-After` header.
- Successful resource creation returns `201 Created`. `200 OK` is reserved for honeypot silent-drop responses and GET endpoints (`/api/health`, `/api/analytics`, `/api/analytics/charts`).
- Turnstile failures (missing or invalid token, when the secret is configured) return `403 Forbidden`.
- Disallowed origins return `403`. **Missing `Origin` header on a protected POST is also rejected with `403`** — non-browser clients must send `Origin: https://vjstv.com` (or another allowlisted value).
- Server misconfiguration in production-like environments returns `503`. The KV-backed rate limiter also fails CLOSED with `429` when the `RATE_LIMIT_KV` binding is missing or unreachable in production (preview/dev with `ALLOW_PREVIEW_ORIGINS=1` continues to fail open so local builds work).
- AI moderation is **fail-safe**: if the model returns malformed/non-JSON output, times out, or errors, the result is `approved:false, needsReview:true` — the submission is created and labelled `needs-review` rather than silently approved.

### Tests
Run `npm test` (uses Node's built-in test runner, no extra deps). Covers: rate-limit 6th-request 429 + Retry-After, KV-missing fail-closed in production, origin policy (missing Origin rejected, allowlist enforced, preview gating), https-only canonical-host video URL allowlist, LLM input sanitization (triple backticks/quotes/role tags/ignore-instructions phrases), moderation injection regression (model that emits `{"approved":true}` inside prose cannot flip approval), Turnstile fail-closed for missing secret/token. 24 tests total.

### Streaming credentials (rotation procedure)
The previous live-stream keys (`STREAM_KEY_1/2/3`) were committed to `.replit` under `[userenv.shared]` and have therefore been treated as compromised. They have been removed from the shared environment.

To restore live streaming:
1. Rotate the keys in YouTube Studio / Restream / your CDN dashboard so the leaked values can no longer publish.
2. Re-add the new keys via Replit **Secrets** (private, never committed): `STREAM_KEY_1`, `STREAM_KEY_2`, `STREAM_KEY_3`.
3. Replit injects secrets into the workflow process, so anything reading `process.env.STREAM_KEY_*` continues to work.

Never paste stream keys back into `.replit` — that file is committed to the repo.

### Form security (Task #1 summary)
- All POST endpoints flow through `guardPost`: CORS preflight, origin allowlist, rate-limit, honeypot trap, Turnstile token check.
- The video-URL field on `/api/submit` only accepts Vimeo and YouTube hosts (host allowlist + ID extraction).
- Email fields are validated and capped at 254 chars before being placed into MIME headers; the MIME builder strips CR/LF/NUL to defeat header injection.
- The moderation prompt explicitly tells the model to treat user content as data and the input is scrubbed of control characters and triple-backticks before being templated in.
- All forms now include `_includes/security/turnstile.html`. When `site.turnstile_site_key` is empty (current default), the widget is not rendered and the server check no-ops, so dev/preview keeps working.

### CSP note
`_headers` and the Express dev server keep `'unsafe-inline'` in `script-src` because numerous templates still use inline `<script>` blocks and `onclick=` handlers (forms, modals, particle canvas, analytics). Moving to a strict CSP with hashes/nonces is Task #4.

## External Dependencies
- **Jekyll Plugins**: `jekyll-feed`
- **Styling**: Bootstrap
- **Fonts**: Google Fonts (Barlow Condensed, Orbitron)
- **Video Hosting/Embedding**: Vimeo, YouTube
- **Form Submission/Backend**: Cloudflare Pages Functions, GitHub Issues (for submissions), Cloudflare Email Routing
- **Bot mitigation**: Cloudflare Turnstile (site key in `_config.yml`, secret in Pages env)
- **Rate limiting**: Cloudflare KV namespace bound as `RATE_LIMIT_KV`
- **Analytics**: Cloudflare Analytics GraphQL API
- **AI Moderation**: Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`)
- **Image/Thumbnail Loading**: Vimeo oEmbed API
- **Deployment**: Cloudflare Pages (frontend + functions)
