# VJs TV - Global Broadcast Network for VJ Culture

## Overview
VJs TV is a Jekyll-based platform dedicated to VJ culture and audiovisual performances. It serves as the broadcasting, discovery, and project infrastructure layer, complementing VJSMag (vjsmag.com) which focuses on editorial content. The project aims to be a central hub for VJ artists, projects, events, and technology, offering a dynamic and interactive experience for the VJ community.

## Running on Replit

The Replit **Start application** workflow runs `node api/server.js` on port 5000. The server serves the generated `_site` directory and runs `bundle exec jekyll build` on startup.

For a fresh environment, install the existing dependencies with `npm install` and `bundle install`. The local preview supports the static site, `/api/health`, and the YouTube metadata proxy; the submission, booking, partner, report, and analytics endpoints require their Cloudflare Pages bindings and secrets as documented below.

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

### Tech SEO foundation (Task #2)
- **Programmatic SEO pages** are generated at build time by `_plugins/programmatic_pages.rb`. The generator first normalises derived attributes onto each collection document (`country_slug`, `technology_slugs`, `event_type_slug`, `matched_tech_slugs`, `title_slug`), then emits one `Jekyll::PageWithoutAFile` per unique value across five route patterns:
  - `/artists/by-country/<slug>/`
  - `/artists/by-technology/<slug>/`
  - `/events/by-country/<slug>/`
  - `/events/by-type/<slug>/`
  - `/technology/<slug>/projects/`
  All pages share `_layouts/programmatic-list.html` which renders an intro paragraph, the matching cards via Liquid `where`/`where_exp` against the precomputed slugs, and a JSON-LD block (`CollectionPage` + `ItemList` + `BreadcrumbList`). Each detail page (`_layouts/vjs-detail.html`) cross-links back into these hubs from a "Browse" sidebar card derived from its own front-matter, completing the link graph.
- Technology titles often carry a vendor prefix (e.g. "Adobe After Effects") while project front-matter uses the shortened name ("After Effects"). The generator builds match-key variants via `ProgrammaticSEO.tech_match_keys` (full title, hyphen-tail short form, vendor-prefix-stripped form against an explicit `VENDOR_PREFIXES` list) so projects are correctly tagged with the tech docs they actually use.
- **Cornerstone /learn/ pages** live at `/learn/{what-is-a-vj,best-vj-software-2026,how-to-projection-map,free-vj-loops}/`. Each carries `Article` + (`FAQPage` or `HowTo`) + `BreadcrumbList` JSON-LD and links into the live artist/technology directories from inline anchors. `/learn/` itself is a hub index.
- **BreadcrumbList JSON-LD** is rendered on every detail page via `_includes/seo/breadcrumb-jsonld.html`, included from `_layouts/vjs-detail.html` and `_layouts/loop-pack.html`. It auto-derives the section name and URL from `page.collection` (vjs → Artists, projects → Projects, etc.) unless the include is called with explicit `section_title` / `section_url` params.
- **Sitemap regeneration**: `sitemap.xml` keeps the curated static-page block but appends every `site.pages | where: "sitemap", true` URL — that picks up programmatic pages (the generator sets `sitemap: true`) and the `/learn/*` pages.
- **Site search** (`search.json` + `search/index.html`) now indexes all five collections (vjs, projects, events, studios, technology) with explicit type badges in the result UI. The legacy `posts`-only output was dead since the site has no blog posts.
- **Image SEO**: card includes (`artist-card.html`, `studio-card.html`) and detail layouts enforce a non-empty `alt`, falling back to a sensible default ("VJ artist", "VJ studio") rather than ever rendering `alt=""`.
- **Removed `<meta name="keywords">` block** from `_includes/core/head/meta-seo-tags.html` — the tag has been ignored by Google for over a decade and the auto-generated value was leaking the front-matter shape to scrapers without any SEO benefit. Description, OG, JSON-LD, and the new programmatic hubs do that job now.

### Robots & AI-bot policy
`robots.txt` declares an explicit per-bot decision rather than blanket `Allow: /`:

- **Allowed** — Googlebot, Bingbot, DuckDuckBot, and the AI assistants that send users back to the source page with attribution: `PerplexityBot`, `Perplexity-User`, `Google-Extended`, `GPTBot`, `ChatGPT-User`, `OAI-SearchBot`, `ClaudeBot`, `Claude-User`, `anthropic-ai`. These drive measurable referral traffic and treat us as a citable source.
- **Disallowed** — bots whose primary mode is bulk harvesting for resold training datasets without attribution: `CCBot` (Common Crawl), `cohere-ai`, `Bytespider` (ByteDance), `ImagesiftBot`, `Omgilibot`, `Diffbot`, `FacebookBot`, `Meta-ExternalAgent`, `PetalBot` (Huawei).

The decision favours generative-AI assistants that surface VJs TV in conversational answers (good for artist discovery) while declining to subsidise unattributed dataset construction. Re-evaluate annually as the bot landscape shifts.

### Conversion funnel (Task #3 — T1–T9)

**Analytics (T1):**
`_includes/utilities/analytics.html` now loads Plausible (privacy-first, no cookie banner) when `plausible_domain` is set in `_config.yml`. Falls back silently when unconfigured. `_includes/utilities/track.html` exposes `window.vjsTrack(name, props)` — a safe no-op wrapper that queues to `window._vjsTrackQueue` and forwards to `window.plausible` when loaded. The A/B variant (`vjs-exp`) is automatically attached to every event as a custom prop.

**Thank-you pages (T2):**
Six noindex pages at `/thank-you/{submit,booking,partner,report,subscribe,download}/` — each fires its conversion event via `vjsTrack` and has 2+ next-step CTAs.

**ESP double opt-in (T3):**
- `functions/api/subscribe.js` — POST creates a pending subscriber in `SUBSCRIBERS_KV` keyed `sub:<email>`. Emits a confirmation email via `env.SEB` (Cloudflare Email Routing). Rate-limited to 3/min, 30/day per IP via `guardPost`.
- `functions/api/subscribe/confirm.js` — GET validates the token (24h TTL, stored as `sub-token:<token>`), flips `status: "confirmed"`, optionally mirrors to Resend audience if `RESEND_API_KEY` + `RESEND_AUDIENCE_ID` are set, then 302s to `/thank-you/subscribe/?status=confirmed`.
- Additional Cloudflare Pages bindings required: `SUBSCRIBERS_KV` (new KV namespace), `SITE_ORIGIN` (e.g. `https://vjstv.com`), optional `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`.
- `_routes.json` updated to include both subscribe routes.
- Footer newsletter form rewired to POST JSON to `/api/subscribe`, with honeypot, redirects to pending/confirmed thank-you page.

**Free-loops landing (T4):**
`free-loops/index.html` — hero email gate POSTing to `/api/subscribe?source=free-loops`, 6-benefit grid, FAQPage JSON-LD (Resolume, TouchDesigner, commercial use, licence, formats, cost). Double CTA (above and below fold).

**Form redirects (T5):**
All four main forms (`submit/index.html`, `partners/index.html`, `_layouts/vjs-detail.html`, `_includes/vjstv-footer.html` report form) now `window.location.href` redirect to their respective `/thank-you/` pages on success, replacing the old inline success divs. Loop pack checkout fires `vjsTrack('download_requested', …)` before navigating.

**Tip jar (T6):**
- Auto-opens after 30s dwell OR 75% scroll, whichever fires first.
- Suppressed on `/thank-you/*`, `/404`, `/partners`, `/free-loops`, `/search`.
- 30-day dismiss cookie (`vjs-tipjar-dismiss`). Manual "Tip Jar" link added to footer bar.
- `vjsOpenTip(trigger)` accepts `'manual' | 'dwell' | 'scroll'` and reports to Plausible.

**A/B harness (T7):**
`functions/_middleware.js` — runs on every HTML response. Reads `vjs-exp` cookie; assigns A/B 50/50 (crypto RNG) on first visit, skips bots (UA pattern list), sets sticky 30-day cookie. Uses `HTMLRewriter` to inject `<meta name="vjs-exp" content="A|B">` into `<head>`. Homepage H1 contains both variant spans (`data-vjs-exp="A/B"`); inline script reads the meta and hides the non-active variant. `window.vjsExp` exposed for components. `Vary: Cookie` header added to rewritten responses.

**Badge widget (T8):**
`assets/images/badges/featured-on-vjstv.svg` — gradient dark badge (200×48px). On all `page.collection == "vjs"` detail pages, a `<details>` disclosure in the sidebar exposes a readonly `<textarea>` with the embed snippet and a "Copy Code" button using `navigator.clipboard.writeText()`. Button fires `vjsTrack('badge_copied', {artist})`.

**CTA hierarchy (T9):**
- Homepage sponsor marquee reduced to a single "Become a Partner" primary CTA with one sub-line; duplicate loop removed.
- `partners/index.html` gets a testimonials section (3 quotes) and a live artist/studio logo strip (up to 6 `featured: true` items from `site.vjs` + `site.studios` Liquid data).

### Content: new artists & studios (May 2026)
Added 3 verified artists to `_vjs/`:
- **Beeple** (`beeple.md`) — digital art / motion graphics / Everydays
- **DocOptic** (`docoptic.md`) — VJ, live visuals educator, Resolume/TouchDesigner
- **Hexeosis** (`hexeosis.md`) — geometric loops / generative digital art (since 2013)

Added 3 verified studios to `_studios/`:
- **United Visual Artists** (`united-visual-artists.md`) — London art/tech practice, `featured: true`
- **Studio Rewind** (`studio-rewind.md`) — Rotterdam motion design & live show visuals
- **Frantic** (`frantic.md`) — London CG / motion design / animation studio

### Streaming hardening & asset externalization (Task #5)

**Duplicate directory reconciled:** `assets/videos/loop-packs/VJs TV Loops 01/` (space-named) deleted; `vjstv-loops-01/` is the single canonical source.

**Video assets externalized to Cloudflare R2:**
- All `*.mp4` and `*.zip` files under `assets/videos/loop-packs/` are gitignored and tracked by `.gitattributes` LFS rules as a safety net.
- `_loop_packs/*.md` front matter uses `preview_video_url:` (R2 URL) for the hero preview video; `download_url:` points to `https://assets.vjstv.com/downloads/<slug>.zip`.
- R2 bucket URL convention: `https://assets.vjstv.com/downloads/<slug>.zip` (paid + free packs), `https://assets.vjstv.com/previews/<slug>-preview.mp4` (loop previews).
- `vjstv-docker/state/` is gitignored (runtime heartbeat files only).

**Schedule signing (HMAC-SHA256):**
- `vjstv-docker/scripts/sign-schedule.js` — CLI tool to wrap `schedule.json` in a signed envelope `{ alg, sig, payload }`. Run: `SCHEDULE_SIGNING_KEY=<hex32> node scripts/sign-schedule.js`.
- `vjstv-docker/scripts/scheduler.js` verifies HMAC-SHA256 signature before applying any schedule change. Unsigned schedules are accepted with a warning when `SCHEDULE_SIGNING_KEY` is unset (dev mode); in production the key must be set.
- The static `schedule/schedule.json` (served to the browser at `/schedule/schedule.json`) supports both raw and signed-envelope formats; the live page unwraps `payload` automatically.

**Restart sidecar (no docker.sock in scheduler):**
- `vjstv-docker/sidecar/restart-sidecar.js` — tiny Node.js HTTP server listening on a unix socket (`/run/restart.sock`). Accepts `POST /restart/:channel`, calls `docker restart`. This is the ONLY container that mounts `/var/run/docker.sock`.
- `vjstv-docker/docker-compose.yml` — `restart-sidecar` service added; `scheduler` no longer mounts docker.sock; both share a named `restart_socket` volume. Scheduler POSTs to the sidecar via unix socket.

**Portainer access control:**
- Portainer's `ports:` mapping removed from `docker-compose.yml` (was `127.0.0.1:9000:9000`). Portainer is accessible only via Cloudflare Tunnel pointing at `http://vjstv_portainer:9000` on the internal Docker network.

**Scheduler Docker HEALTHCHECK:**
- Reads `vjstv-docker/state/heartbeat-<channel>.json` written every cron tick; exits non-zero if any file is missing or older than 5 minutes.
- `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers added to scheduler.js.

**Heartbeat → /live/ integration:**
- Scheduler writes `vjstv-docker/state/heartbeat-{ch1-live,ch2-loop-gallery,ch3-vj-education}.json` every tick.
- `functions/api/stream/heartbeat.js` — HMAC-authenticated POST endpoint; stores heartbeat in `HEARTBEAT_KV` (TTL 15 min).
- `functions/api/stream/status.js` — unauthenticated GET; returns all channel heartbeats with `status: live|stale|unknown` and `age_secs`.
- `/live/` page fetches `/api/stream/status` on load and every 60 s; programming grid shows real ON AIR / OFFLINE / LIVE NOW per channel.

**Stripe checkout for paid packs:**
- `functions/api/checkout/create-session.js` — POST `{ slug, email }` → returns `{ url }` (Stripe Checkout URL). Free packs return `free_pack_use_lead_magnet` error.
- `functions/api/checkout/webhook.js` — verifies Stripe webhook signature, emails the R2 download URL via `env.SEB` on `checkout.session.completed`.
- `/buy/` page (`buy/index.html`) reads `?slug=` from URL, POSTs to `/api/checkout/create-session`, and redirects to the Stripe-hosted checkout page.
- Loop-pack layout `BUY NOW` button replaced: links to `/buy/?slug=<slug>` (no more fake card-input modal).

**New Cloudflare Pages bindings required:**
- `HEARTBEAT_KV` — KV namespace for per-channel heartbeat storage.
- `HEARTBEAT_SECRET` — HMAC secret matching the Docker env var; authenticates scheduler → Pages heartbeat POSTs.
- `STRIPE_SECRET_KEY` — Stripe secret key for creating checkout sessions.
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret.
- `R2_DOWNLOAD_BASE` — optional; defaults to `https://assets.vjstv.com/downloads`.

**New Docker env vars (see `vjstv-docker/.env.example`):**
- `SCHEDULE_SIGNING_KEY` — hex-32 HMAC key for schedule signing.
- `HEARTBEAT_SECRET` — matching secret for heartbeat POST auth.
- `HEARTBEAT_ENDPOINT` — full URL of the Pages heartbeat function.

## External Dependencies
- **Jekyll Plugins**: `jekyll-feed`
- **Styling**: Bootstrap
- **Fonts**: Google Fonts (Barlow Condensed, Orbitron)
- **Video Hosting/Embedding**: Vimeo, YouTube
- **Form Submission/Backend**: Cloudflare Pages Functions, GitHub Issues (for submissions), Cloudflare Email Routing
- **Bot mitigation**: Cloudflare Turnstile (site key in `_config.yml`, secret in Pages env)
- **Rate limiting**: Cloudflare KV namespace bound as `RATE_LIMIT_KV`
- **Analytics**: Plausible Analytics (primary, `plausible_domain` in `_config.yml`); Cloudflare Analytics GraphQL API (secondary, `/api/analytics`)
- **AI Moderation**: Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`)
- **Image/Thumbnail Loading**: Vimeo oEmbed API
- **Deployment**: Cloudflare Pages (frontend + functions)
