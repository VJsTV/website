# VJs TV — Full Website Audit (Follow-up)

**Audit date:** 2026-08-21
**Scope:** Security (backend/API + infrastructure), architecture & code quality, SEO & structured data, performance, accessibility (WCAG 2.1 AA), conversion funnel, dependency health, content freshness.
**Method:** Seven parallel deep-dive reviews of the full source tree at HEAD (`6f4615d`), cross-checked against the two prior audits in this repo (`AUDIT.md` and `GROWTH_AUDIT.md`, both 2026-05-02) to classify every finding as **FIXED**, **STILL-OPEN**, **REGRESSED**, or **NEW**.

---

## 1. Executive summary

The May 2026 audits triggered a genuinely large remediation effort, and most of it landed well:

**Fixed since May (verified):**
- Duplicate API layer removed — `functions/worker.js` deleted; single same-origin `/api/*` surface via Pages Functions with shared `_lib/` modules.
- CORS is allowlist-based (no more wildcard on form endpoints), rate limiting is KV-backed and fails **closed** in production, Turnstile is enforced fail-closed, moderation no longer fails open and has layered prompt-injection defenses, email header injection is blocked. 24 real security regression tests exist and pass.
- The fake newsletter form is now a real double-opt-in flow (KV pending→confirmed, Resend ESP sync, fail-closed when ESP unconfigured). Six real thank-you pages, all four forms wired to them, real Plausible conversion-event tracking (16 call sites).
- SEO: site search now indexes all 185 collection items, keywords meta removed, canonical logic fixed, BreadcrumbList + FAQPage + HowTo schema added, robots.txt AI-bot policy is now deliberate per-bot, sitemap is dynamic.
- Stream keys removed from `.replit`; deploy-config triplication (`netlify.toml`/`github.toml`) cleaned up; loop-pack videos moved out of the working tree.

**Top issues now (ranked):**

| # | Severity | Issue |
|---|---|---|
| 1 | **CRITICAL** | The three leaked YouTube stream keys are still fully recoverable from git history (`git show` on the commit that introduced `.replit`) **and are quoted verbatim in the committed `AUDIT.md`**. Nothing in the repo evidences rotation. Treat as compromised; rotate at YouTube now, then redact `AUDIT.md` and consider history rewrite. |
| 2 | **HIGH** | Homepage "Broadcast Schedule" panel renders **zero events** today: `index.html` applies `limit:8` to the date-ascending list *before* the future-date filter, and the 8 oldest events are all past. `/live` similarly shows a 2025 stream as the "next live stream" (no date filter at all). |
| 3 | **HIGH** | Homepage `<h1>` **regressed** — added in May's Task #2, deleted again by the June hero-removal commit. `/live/` has no headings at all. |
| 4 | **HIGH** | `checkout/create-session.js` bypasses the shared guard: no rate limiting, no Turnstile, hand-rolled CORS. Currently defused (only pack is $0 → lead-magnet branch), but it becomes an open Stripe-cost/abuse surface the moment a paid pack ships. Webhook also lacks timestamp tolerance + `event.id` idempotency (replay re-sends download emails) and uses non-constant-time compares. |
| 5 | **HIGH** | `stream/heartbeat.js` auth is skipped entirely when `HEARTBEAT_SECRET` is unset — which is the documented default (`.env.example` ships it blank). Same silent fail-open pattern for `SCHEDULE_SIGNING_KEY`. |
| 6 | **HIGH** | Git hygiene: `_site/` (2,361 files) and `attached_assets/` (108 MB) are gitignored **but tracked**; `.git` is 427 MB of a 753 MB repo; 38 of 50 commits re-commit build output. `git rm -r --cached` both + history cleanup. |
| 7 | **HIGH** | Performance: full-screen preloader hides content until `window.load`/6 s; ~2 MB of legacy Bootstrap/Revolution-Slider CSS+JS ships on every page while barely used; homepage Vimeo iframe loads eagerly; only 1 of ~27 CSS/JS files is cache-busted despite 1-year `immutable` headers → stale-cache on every deploy. |
| 8 | **HIGH** | Docker: `docker.sock` moved from scheduler to a new `restart-sidecar` — but the sidecar's own code is inside the tree that unauthenticated `git-sync` pulls every 10 min, so a malicious push to `main` still reaches the socket one restart later. FFmpeg `-safe 0` unchanged. |
| 9 | **CRITICAL (a11y)** | No form field on the Submit page or booking modal has a programmatic label (no `for`/`id`, ~21 fields); search + newsletter inputs have placeholder-only naming; focus outlines suppressed with `outline:none !important` on exactly the controls keyboard users hit. |
| 10 | **MEDIUM** | Deployment ambiguity: `.replit` still wires a Replit **autoscale** production target running `api/server.js` (which serves only 2 of 22 API routes), while docs say production is Cloudflare Pages. Confirmed live symptom: `/api/yt-info` 404s on Pages, so `/live` silently shows raw YouTube IDs instead of titles. |

Also notable: `npm test` is broken (`node --test tests/` fails on Node 22; run the file directly and all 24 tests pass — and there is **no CI at all** to catch this), README still describes a completely wrong tech stack (React/Next/MongoDB/Vercel), `_data/reviews.json` is Lorem-Ipsum placeholder testimonials, and orphaned theme demo pages are publicly reachable at `/shop/*`.

---

## 1a. The deploy pipeline is broken (added 2026-08-21, from a live build log)

The Cloudflare **Workers Builds: vjstv** check fails on every build. The build log shows three independent defects, none of which are fixable by editing this repository — all three are Cloudflare **dashboard** settings.

```
Executing user build command: jekyll build
Configuration file: none                              ← no _config.yml found
     Source: /opt/buildhome/repo/_site                ← building FROM _site
Destination: /opt/buildhome/repo/_site/_site          ← into _site/_site
     done in 1.065 seconds.
Executing user deploy command: npx wrangler versions uploa
✘ [ERROR] Unknown argument: uploa
Failed: error occurred while running deploy command
```

**D-1 — Deploy command is misspelled (CRITICAL, blocks every deploy).**
The configured deploy command is `npx wrangler versions uploa` — missing the trailing `d`. Wrangler rejects it at argument parsing, so the deploy step fails before touching any repo file. **No change to this repository can make that command parse.** Fix: in the Cloudflare dashboard → Workers → `vjstv` → Settings → Build → Deploy command, change `uploa` to `upload`.

**D-2 — Build root directory is `_site` (CRITICAL).**
Jekyll reports `Configuration file: none` and `Source: …/repo/_site`, meaning the build runs one directory too deep — the project's root-directory setting points at `_site` instead of the repo root. Consequences: `_config.yml` is never loaded (so no collections, no permalinks, no plugins — note the absent `Jekyll Feed:` line), and output goes to `_site/_site`. The real site is never rebuilt by this pipeline. Fix: set the build root/output directory to the repo root, with output `_site`.
*Verified locally:* `bundle exec jekyll build` from the repo root succeeds in 2.3 s, loads `_config.yml`, and generates the feed — including this PR's new file. The repository builds fine; the pipeline points at the wrong directory.

**D-3 — No Wrangler configuration exists anywhere in the repo (HIGH).**
`git log --all` shows `wrangler.json`/`wrangler.jsonc`/`wrangler.toml` have **never** been committed, and `.gitignore:10-12` actively excludes them. Even with D-1 and D-2 fixed, `wrangler versions upload` has no config and no entry point to upload. This also indicates a product mismatch: every doc, `_routes.json`, `_headers`, and the `functions/` file-routing convention describe a **Cloudflare Pages** project, but the failing check is **Workers Builds**. Decide which product this deploys to before adding config — this is an architectural decision, not a mechanical fix.

**D-4 — The committed `_site/` is 45% incomplete (HIGH) — and this changes finding #6 above.**
Because the pipeline never performs a real build, whatever is served comes from the **stale `_site/` committed to git**. Comparing it against a fresh local build:

| | committed `_site/` | real build |
|---|---|---|
| Total HTML pages | 186 | **340** |
| `/artists/` pages | 21 | **120** (missing all 29 programmatic `by-country` / `by-technology` hubs) |

Entirely **absent** from the committed output: `_headers` (all security headers incl. CSP), `_routes.json` (Pages Functions routing), `sitemap.xml`, `robots.txt`, `search.json`, `atom.xml`, and the whole `/learn/` (5), `/thank-you/` (6), `/marketplace/` (3), `/buy/`, `/free-loops/`, and `/license/` sections.

If the live site is being served from this tree, then the conversion funnel's thank-you pages, the cornerstone `/learn/` SEO pages, the marketplace, the sitemap, robots.txt, and **every security header audited in §2–§3 are simply not deployed** — the headers would exist only as an un-shipped source file. Confirm what is actually live at `vjstv.com` before trusting any §2/§3 header finding as production-accurate.

> ⚠️ **Ordering caveat that supersedes action item #6.** Do **not** run `git rm -r --cached _site` until D-2 is fixed. While the build root is wrong, the committed `_site/` is the only artifact the pipeline has to serve — removing it could take the site down. Fix the build root first, confirm a real build deploys, *then* untrack `_site/`.

---

## 2. Security — backend & API

Status vs. May audit, with evidence:

| Severity | File | Finding | Status |
|---|---|---|---|
| — | `functions/_lib/cors.js:32-52` | Allowlisted-origin CORS, `Vary: Origin`, POST without Origin rejected | FIXED |
| — | `functions/_lib/rate-limit.js` | KV-backed, keyed on edge-set `CF-Connecting-IP` (not spoofable via `X-Forwarded-For`), fails closed in prod | FIXED |
| — | `functions/_lib/guard.js:37-47` | Turnstile fail-closed (503 when secret missing in prod) | FIXED |
| — | `functions/_lib/moderation.js:77-94` | Errors/malformed output → `approved:false, needsReview:true`; input sanitized pre-templating; strict JSON-only response parser | FIXED |
| **HIGH** | `functions/api/checkout/create-session.js:7-23` | Own CORS logic; **no rate limit, no Turnstile** — weakest protection on the payment-adjacent endpoint | NEW |
| **HIGH** | `functions/api/stream/heartbeat.js:17-29` | HMAC check only `if (env.HEARTBEAT_SECRET)`; unset (the default) → effectively unauthenticated | NEW |
| MEDIUM | `functions/api/checkout/webhook.js` | No `t=` timestamp tolerance (indefinite replay), no `event.id` idempotency (replays re-send download email), `===` signature compare | NEW |
| MEDIUM | `functions/api/submit.js:78-137` | YAML front-matter escape only handles `"`; trailing `\` breaks out of the quoted scalar; ``` ``` ``` in fields breaks the issue-body fence → front-matter/issue-body injection a maintainer might trust | NEW |
| MEDIUM | `tests/`, `scripts/smoke-api.sh` | Good real coverage of the *old* endpoints; zero coverage of `checkout/*`, `subscribe*`, `stream/heartbeat` — exactly the endpoints with the gaps above | NEW |
| LOW | `package.json:6` | `node --test tests/` fails (MODULE_NOT_FOUND) on Node 22; suite passes when file invoked directly | NEW |

**Root cause pattern:** the newer endpoints (`subscribe.js`, `create-session.js`, `heartbeat.js`) re-implement or skip the shared `guardPost` instead of using it — which is how `create-session.js` ended up unprotected. **Fix:** route every POST endpoint through `guardPost`, and add webhook idempotency + timestamp checks.

Secrets scan of the working tree is clean (all secrets via `env.*`; no hardcoded Stripe/GitHub/AWS tokens).

## 3. Security — infrastructure & deployment

- **Stream keys (CRITICAL, still open in reality):** removed at HEAD, but the introducing commit is in history and `AUDIT.md` lines ~289-291 reproduce the raw values in the current tree. `replit.md` documents a rotation SOP but nothing confirms rotation. **Rotate at YouTube, redact `AUDIT.md`, then `git filter-repo`/BFG the history** (which also fixes the 427 MB `.git`).
- **`git-sync` (HIGH, still open):** unauthenticated `git pull origin main` every 600 s, `|| true` swallowing failures. Combined with the sidecar below, push access to `main` still equals eventual `docker.sock` access.
- **`restart-sidecar` (partially fixed):** scheduler no longer mounts `docker.sock`; the sidecar is well-scoped (fixed container map, no shell interpolation) — but its source lives in the git-synced tree and it holds the socket, so the escalation path survives one hop removed. Move the sidecar image/code out of the synced tree, or verify signatures on pull.
- **FFmpeg `-safe 0`** unchanged on all 3 channels; blast radius bounded to the container's `./:/app` mount (not host root), but playlist commits can still cause arbitrary-path reads/SSRF-shaped fetches.
- **Scheduler:** healthchecks now exist (good), but `uncaughtException`/`unhandledRejection` handlers only log — they never exit, and `restart: always` only reacts to process death, so a wedged scheduler stays wedged. Copy the exit pattern from `api/server.js:17-27`.
- **`cloudflare.toml` is dead config** — Netlify-schema TOML that Cloudflare Pages never reads, with a stale Ruby pin and missing CSP/Permissions-Policy. `_headers` is the real authority. Delete `cloudflare.toml`.
- **Replit autoscale vs Cloudflare Pages (NEW, MEDIUM):** `.replit` deploys `api/server.js` as production while docs say Cloudflare Pages is production. Confirmed symptom: `/live` calls `/api/yt-info`, which exists only in the Express server → 404 on Pages, silent fallback to raw video IDs. Either delete the `.replit` deployment block or port `yt-info` to a Pages Function.
- **CSP `unsafe-inline` (tractable):** the actual inline-script surface is ~14 files with static (non-Liquid-interpolated) bodies + 23 `on*=` attributes in 6 files — extraction to hashed/external files is a bounded project, not the "everywhere" the `_headers` comment implies.

## 4. SEO & structured data

Fixed: search index (S-1.1), keywords tag (S-1.3), canonical logic (S-1.4), robots AI policy (S-1.5), sitemap mechanism (S-1.6), BreadcrumbList (S-1.8), FAQPage/HowTo (S-1.9). JSON-LD footprint is broad and well-formed (13+ types, `jsonify`d correctly). OG/Twitter tags site-wide and per-page.

Open/new:

| Severity | Finding |
|---|---|
| **HIGH** | Homepage H1 **REGRESSED** (removed by hero-removal commit `93a0d60`; only a hidden `<h2>` remains). `/live/` has zero heading tags. |
| MEDIUM | 65% of detail pages (120/185) have `description:` fields of 170–210 chars truncated mid-sentence by `truncate: 160` — trim source descriptions or raise handling. |
| MEDIUM | `image:` front matter missing on 58/59 projects, 23/23 events, 29/29 technology → one shared generic OG image for ~111 pages and no `image` in Event JSON-LD (hurts rich results). |
| MEDIUM | 4 of 6 card partials render no `<img>` at all (CSS gradients / JS Vimeo backgrounds) — no image SERP surface for most detail types. |
| LOW | No hreflang (deliberate for now); 404 page minimal (but noindexed, has nav); dead exclusion clause in `sitemap.xml:34`; `@id` slash inconsistency in JSON-LD. |

## 5. Performance

| Severity | Finding | Fix |
|---|---|---|
| **CRITICAL** | Preloader keeps `.content-wrapper` at `opacity:0` until `window.load` or a 6 s timeout — every page's paint is gated on every subresource | Reveal on `DOMContentLoaded`; drop the 6 s gate |
| **HIGH** | ~1.0 MB CSS + ~0.95 MB JS of legacy theme assets (Bootstrap, Revolution Slider, type.css) load on **every** page; index.html uses 1 Bootstrap class and zero Revolution markup | Drop/scope per-template |
| **HIGH** | Homepage Vimeo iframe has a static `src` — full player boot on first paint | Poster + click-to-load facade |
| **HIGH** | Cache-busting only on `vjstv.css`; all other CSS + all 17 JS files have static names under 1-year `immutable` headers → returning visitors get stale code after deploys | Extend `?v=`/content-hash to all assets |
| **HIGH** | 15 images > 500 KB live-referenced, incl. 2.6 MB PNG artist photo (duplicated byte-identical in two dirs) | Convert to AVIF/WebP (already the norm for half the artist set) |
| MEDIUM | 107 of 112 template `<img>` tags lack `width`/`height` (CLS); Vimeo thumbnails fetched for all project cards on load (no IntersectionObserver); Google Fonts via `@import` inside a blocking stylesheet | Add dimensions; lazy-gate; move fonts to `<link>` |
| LOW | 25 MB unused "Jost" font family + 17.8 MB unreferenced `assets/media/movie.*` shipped in every deploy | Delete |

No build/minification pipeline exists at all (`package.json` has no build script) — a small esbuild/cssnano step would cover findings 2, 4 and minification together.

## 6. Accessibility (WCAG 2.1 AA)

Positives: skip link works, `lang="en"`, real `<button>`s everywhere (no `div onclick` anti-pattern), global `:focus-visible` rule and `prefers-reduced-motion` rule exist.

| Severity | WCAG | Finding |
|---|---|---|
| **CRITICAL** | 1.3.1 / 3.3.2 | No `for`/`id` label association on any of ~13 Submit-form fields (`submit/index.html:57+`) or ~8 booking-modal fields (`_layouts/vjs-detail.html:398+`); search + newsletter inputs are placeholder-only |
| **HIGH** | 2.4.7 | `outline: none !important` kills the focus ring on share buttons, search input, newsletter input (`vjstv.css:902,1343,2438`) — overrides the site's own good global rule |
| **HIGH** | 4.1.3 | Form success/error + newsletter status messages have no `aria-live`/`role="alert"` — invisible to screen readers |
| **HIGH** | 4.1.2 / 1.1.1 | Hamburger + drawer-close buttons have no accessible name (`nav-3.html:21,47`) |
| MEDIUM | 1.4.3 | `--vjs-text-muted #7070a0` on `#050505` ≈ 4.4:1 (borderline fail); `rgba(255,255,255,0.3–0.35)` hint text ≈ 2.9–3.0:1 (clear fail) |
| MEDIUM | 2.4.3 / 2.2.2 | No Escape/focus-trap/focus-return on mobile drawer + schedule flyout (zero `keydown` handlers in `scripts.js`); booking dialog handles Escape but doesn't trap Tab; autoplay logo carousel has no pause control |
| MEDIUM | 1.1.1 | Filename-as-alt in clients carousel/gallery; `alt=""` on informative shop product images |
| LOW | — | Live-stream iframe has no `title`; footer social icons use `title=` where nav uses `aria-label` |

The label-association and focus-outline fixes are mechanical and high-impact — a day of work covers the Critical/High rows.

## 7. Conversion funnel & content freshness

Funnel work from May is real and complete (subscribe double-opt-in, thank-you pages, event tracking, form wiring — all verified in code). Remaining:

| Severity | Finding |
|---|---|
| **HIGH** | Homepage schedule panel empty (filter-after-limit bug, `index.html:69-88`) — swap the order: filter future events **then** `limit:8` |
| **HIGH** | `/live` "Next Live Stream" widget has no date filter (`live/index.html:339-346`) — currently shows an April 2025 stream |
| MEDIUM | 16/23 events (~70%) past-dated; `/events` defaults to "All / Newest First" rather than Upcoming |
| MEDIUM | `subscribe.js:148` never checks `sendEmail()`'s return — user told "check your inbox" even when the opt-in email silently failed |
| MEDIUM | Stripe flow scaffolded but unlaunched: single $0 pack always short-circuits to the lead magnet; marketplace "PAID" filter is dead |
| MEDIUM | `_data/reviews.json` is unedited Lorem Ipsum (2019 dates, theme stock names) — reachable via live `/shop/*` theme demo pages that are unlinked but not noindexed/excluded |

**Dependencies:** healthy. `express@5.2.1` lockfile already resolves the three `npm audit` transitive findings to patched versions (the audit output reflects a stale installed tree — verify with fresh `npm ci && npm audit`). Ruby side (`jekyll 4.3.4`, `kramdown 2.5.2`, `rexml 3.4.4`) has no outstanding known CVEs.

## 8. Code quality & docs

- **README.md:40-45 still describes the wrong stack** (React/Next/Tailwind/MongoDB/Vercel) — unchanged since May. `replit.md` is accurate and current; rewrite README from it.
- `package.json`: `main: index.js` points at a nonexistent file; `license: ISC` vs README's MIT badge vs the `/license/` page's MIT copy vs **no root LICENSE file** — four-way inconsistency.
- **No CI whatsoever** (no `.github/`) — nothing runs the (broken) `npm test`, the smoke script, or a Jekyll build check on push.
- Dead code: ~6 unused modal includes, ~18 unused nav/footer/page-title theme variants, ~25 unused layouts (blog/portfolio/shop), the excluded-but-present `shop/` dir, dead Disqus include with a copy-pasted foreign shortname (CSP-blocked anyway).
- `_plugins/programmatic_pages.rb` (the only custom plugin) is clean and well-scoped. Internal links spot-check: clean.

---

## 9. Recommended action plan

**Do now (hours):**
0. **Fix the deploy pipeline (§1a)** — it is currently failing on every build, so nothing below actually reaches production until it's repaired. In the Cloudflare dashboard: (a) correct the deploy command `uploa` → `upload`, (b) set the build root to the repo root rather than `_site`, (c) decide Pages vs Workers and commit the matching config. Then verify a real build deploys 340 pages, not 186.
1. Rotate the three YouTube stream keys (assume compromised); redact the values from `AUDIT.md`.
2. Fix the homepage schedule filter-order bug and the `/live` next-stream date filter.
3. Restore the homepage `<h1>`; add one to `/live/`.
4. Route `checkout/create-session.js` and `stream/heartbeat.js` through `guardPost` (rate limit + Turnstile); make `HEARTBEAT_SECRET`/`SCHEDULE_SIGNING_KEY` fail-closed in prod.
5. Fix `package.json` test script (`node --test tests/*.test.mjs`) and add a minimal GitHub Actions workflow (test + Jekyll build).
6. `git rm -r --cached attached_assets package-lock.json` (as intended by `.gitignore`) and stop committing them. **`_site` must wait until §1a/D-2 is fixed** — see the ordering caveat there.

**This month:**
7. Webhook hardening: timestamp tolerance, `event.id` idempotency, timing-safe compares; escape backslashes/backticks in `submit.js` YAML/issue-body generation; check `sendEmail()` result in `subscribe.js`.
8. A11y sprint: label associations, remove `outline:none !important`, `aria-live` on form statuses, `aria-label` on hamburger/close, contrast tokens.
9. Perf sprint: kill/de-gate the preloader, drop legacy theme CSS/JS, facade the Vimeo hero, extend cache-busting to all assets, compress the 15 oversized images, delete the 43 MB of dead fonts/video.
10. Resolve the deployment split: delete the `.replit` autoscale block (or port `yt-info` to a Pages Function); delete `cloudflare.toml`; rewrite README from `replit.md`; pick one license.
11. Content: archive/refresh the 16 past events; default `/events` to Upcoming; replace or remove `reviews.json` + `/shop/*` theme demos (or noindex + robots-exclude them).

**This quarter:**
12. History rewrite (`git filter-repo`) to purge secrets + 427 MB of committed build output.
13. Move `restart-sidecar` code out of the git-synced tree (or verify signed commits before pull); reconsider `-safe 0`.
14. CSP Task #4: extract the ~14 inline-script files + 23 inline handlers, drop `'unsafe-inline'`.
15. Ship a paid loop pack to activate the (already-built) Stripe path — with the guard fixes from #4 in first.
