# VJs TV — Growth, SEO & Conversion Audit

**Audit date:** 2026-05-02
**Scope:** Senior Growth Engineer / SEO Strategist / Digital Performance Architect review of `https://vjstv.com`
**Companion to:** `AUDIT.md` (security/architecture)

---

## 1. EXECUTIVE SUMMARY

**Three biggest things blocking growth, ranked:**

1. **The site is well-instrumented for SEO but invisible to its own search.** JSON-LD is genuinely strong (Organization, WebSite, BroadcastChannel, Person, CreativeWork, VisualArtwork, Event, SoftwareApplication, Product, ItemList) — better than 90% of comparable sites. But internal site search (`search.json`) only indexes 20 stale `_posts/` and **misses every artist (20), project (56), event (24), studio (45), and tech tool (30)**. A user who searches a famous artist's name on the site gets nothing. Single highest-leverage SEO/UX bug in the codebase.

2. **Zero email capture, zero CRM, zero remarketing.** The footer "Stay Updated" form is a fake — `onsubmit="event.preventDefault(); ...subscribed='✓'"` literally just lies to the user. There is no ESP integration, no email list, no welcome flow, no segment. The site has 175+ detail pages that pull traffic but have no mechanism to convert that traffic into anything you can talk to again. This is the single highest-leverage growth lever you are not pulling.

3. **Conversion funnels are leaky and untested.** Submit / Booking / Partner / Report all post to forms with no confirmation page, no thank-you state with next-step CTAs, no event tracking (no GA4, no PostHog, no Plausible — just Cloudflare Web Analytics which gives you traffic but not events), no abandonment recovery. You cannot tell which channels convert because you do not measure conversions.

**Three biggest opportunities, ranked by ROI:**

1. **Programmatic SEO.** You have rich, taxonomized data for **174+ entities** across 5 dimensions (artist × country × technology × studio × event). At minimum 4–5 highly defensible programmatic page templates: `/artists/by-country/{country}`, `/artists/by-technology/{tech}`, `/technology/{tool}/artists` (reverse), `/events/by-country/{country}`, `/events/{year}`. Each generates 30–80 indexed pages with strong long-tail intent ("VJ artists Berlin", "TouchDesigner artists", "VJ events 2026 Helsinki"). Order-of-magnitude SEO surface for ~M effort.

2. **Capture and grow an audience of VJs.** This community lives on Discord/Reddit/IG. None of those are owned channels. A real newsletter ("New artists, new packs, what's broadcasting tonight on CH.1") with a free loop pack as a lead magnet would convert 5–15% of visitors and give you the only durable distribution channel that doesn't depend on a Cloudflare worker.

3. **Loop pack monetization.** 760 MB of original loop content sits in Git, gated by nothing, with one product page (`_loop_packs/`). With Stripe + signed Cloudflare Stream URLs you can sell these. Even at $5–15 a pack and modest organic traffic, this becomes the first revenue line for the platform.

---

## 2. FULL AUDIT FINDINGS

### 2.1 SEO — Technical & On-Page

**S-1.1 — Site search is broken (CRITICAL).** `search.json` iterates `site.posts`. The site doesn't surface posts in nav. The actual searchable corpus (175+ collection items) is invisible.

**S-1.2 — Homepage has zero `<h1>`.** Confirmed via grep on `index.html`. Google penalizes missing/duplicate H1 on landing pages and most heuristic SEO tools score it as a defect.

**S-1.3 — `meta-seo-tags.html` keyword tag still present.** No engine has used `<meta name="keywords">` for ranking since ~2009 (Bing dropped it in 2014). The fallback templates also generate awkwardly truncated strings (e.g., `VJ event, live visual performance, , performance, ` when fields are missing). Drop entirely.

**S-1.4 — Canonical normalization edge case.** The canonical-URL Liquid logic strips trailing slashes — but Cloudflare Pages and Jekyll's collection permalinks **with** trailing slashes are the canonical form. You may be telling Google your canonical is `/artists/joanie-lemercier` while the actual served URL is `/artists/joanie-lemercier/`. Google will follow but will sometimes split signals. Verify: `curl -sI https://vjstv.com/artists/joanie-lemercier/` and confirm 200 vs 301.

**S-1.5 — `robots.txt` allows every AI scraper unconditionally.** GPTBot, ClaudeBot, CCBot, PerplexityBot, anthropic-ai, cohere-ai — all `Allow: /`. This is a deliberate posture for some sites; for an *original-content* site (artist bios, project descriptions, original photography) it gives away your content for nothing. At minimum, decide explicitly per-bot. Recommended: allow Perplexity (sends referral traffic), block CCBot (used to train competitors), restrict GPTBot to `/blog/` only when you have one.

**S-1.6 — Sitemap is partially manual.** `sitemap.xml` is a hand-maintained Liquid template (163 lines). The collection counts grew 60+ items over the project's life and the static URLs in the sitemap (countries, business-model, license) drift. Migrate to `jekyll-sitemap` plugin (already supported) or auto-generate from `site.collections`.

**S-1.7 — No `hreflang`, no language alternates.** You self-identify as `inLanguage: en` but the audience is global (Berlin, Madrid, Helsinki, Tokyo, etc., per content). One language is fine for now — but eventually adding `pt-BR` (huge VJ community in Brazil), `es`, `de`, `ja` would unlock 5× the addressable market. Architectural decision to make early.

**S-1.8 — No structured `BreadcrumbList`.** You have detail pages 3 levels deep (`/artists/joanie-lemercier/`) but no breadcrumb schema. Google rich-result eligibility loss.

**S-1.9 — No `FAQPage` / `HowTo` schema anywhere.** "How to start VJing", "What is projection mapping", "Best VJ software for beginners" are search queries with massive volume in this niche. Each FAQ-rich page can earn an answer-box result.

**S-1.10 — Image SEO weak on detail pages.** Sampled `_vjs/`: `image: "/assets/images/artists/denial-of-service.avif"` is referenced but no `alt` is enforced in templates. Large image SERP traffic potential left on the table.

### 2.2 Search Engine Performance — Keyword & Content Strategy

**S-2.1 — Topic clusters are unbuilt.** You own great content nuclei (`Resolume`, `TouchDesigner`, `MadMapper`, `projection mapping`, `generative art`) but have no hub pages connecting them. Each "technology" detail page is an island; no `/technology/touchdesigner/artists`, no `/technology/touchdesigner/projects`, no `/technology/touchdesigner/learn`.

**S-2.2 — Programmatic SEO untapped.** Per the data inventory:
- 9 unique countries across artists → `/artists/by-country/{country}` (9 pages, low effort)
- 30 technologies across artists → `/artists/using/{tech}` (30 pages)
- ~12 event types across events → `/events/{type}` (12 pages)
- Combinatorial: `/events/{country}` (15+), `/events/{year}` (3+)
- Reverse: `/technology/{tool}/projects` (30 pages)

Total: **~100 high-quality programmatic pages** generated from existing data with one Liquid template each.

**S-2.3 — No content velocity.** `_posts/` has 20 stale items from the original blog template (none are surfaced in nav). There is no original commentary, no interviews, no event reviews — none of the high-value editorial content that ranks, gets shared, and earns links in this niche.

**S-2.4 — No backlink strategy.** No press kit, no media mentions page, no "as featured in" social proof, no embedded code (`<embed>` widgets) you give to studios/artists for inclusion on their own sites (which would be free natural links). Festivals love being listed — every event page should have a one-click "claim this listing / add your event" flow that emails you and gives them a badge to display.

**S-2.5 — Featured snippet opportunities ignored.** Queries like "best VJ software 2026", "what is a VJ", "how to projection map", "free VJ loops" — these are hit-and-run answer-box opportunities. None have a dedicated page on the site.

### 2.3 Brand Visibility & Differentiation

**S-3.1 — Positioning is implicit, not explicit.** Homepage hero says "VJs TV" with no value-prop sentence. Compare:
- *Resolume* → "VJ Software & Media Server"
- *Hopin* → "Video for Connection"
- A reader who lands on vjstv.com from search needs to know in <2 seconds: who you are, who you're for, why you exist. Today they do not.

**S-3.2 — "About" page is empty (`about/` exists but is excluded from build per `_config.yml`).** No founder story, no manifesto, no team page. For a niche/cultural site, story is brand. People share founders.

**S-3.3 — Social proof is missing.** No testimonials on `/partners/`, no logos of featured artists on the homepage above the fold, no quotes from listed studios. The site has the social capital of being an authoritative directory but does not display it.

**S-3.4 — Channel mismatch with audience.** VJ culture's biggest channels are Instagram and Vimeo. The footer has `tiktok.com/@vjs.tv` but TikTok is a marginal channel for this audience. Audit the actual referral mix in CF Analytics; reallocate effort.

**S-3.5 — No earned-media flywheel.** Every event/festival you cover should produce: (a) a recap post with embedded photos/video, (b) a tagged shout-out to organizers, (c) an offer to be the official "live blog" for next year's edition. None of this scaffolding exists.

### 2.4 Site Performance & UX Impact on SEO

**S-4.1 — JS payload kills mobile rankings.** Per AUDIT.md F-3.2: ~1.2 MB of JS minified. Core Web Vitals (INP, LCP, CLS) are likely failing on mid-tier Android. Google has been ranking on CWV since 2021 — this is a measurable demotion.

**S-4.2 — Preloader hides the page for up to 6 s.** Both UX (bounce rate) and SEO (LCP measured against the visible content). Modern Lighthouse will score this 30–50% LCP loss.

**S-4.3 — Vimeo oEmbed N+1.** Per AUDIT.md F-3.3: each thumbnail blocks. CWV INP suffers; user perception suffers more.

**S-4.4 — Mobile UX:** 13 nav variants exist (`nav-1.html` … `nav-11.html`) but you ship `nav-3.html`. None are tested for tap targets <48px on iOS (the partner CTAs in the homepage stat strip are 0.78rem font in a 9px-padded button — likely below WCAG and Google's mobile-friendly threshold).

### 2.5 Conversion Optimization

**S-5.1 — Newsletter form is a fake (CRITICAL).** `_includes/vjstv-footer.html` line 42:
```html
<form ... onsubmit="event.preventDefault(); this.querySelector('button').textContent='✓ Subscribed'; ...">
```
It captures nothing. Every "subscribe" event is a lie to the user and a wasted intent signal.

**S-5.2 — No event tracking.** `_includes/utilities/analytics.html` is gated on a `general_settings.google_analytics.enable` flag that isn't set, and uses the **deprecated `analytics.js`** (replaced by GA4 in 2023). No GA4. No PostHog, Plausible, Fathom, or anything else. You cannot tell:
- Which acquisition channel converts to submission
- Which detail pages drive booking inquiries
- Which technologies drive partner applications
- What % of visitors scroll to the live strip

**S-5.3 — Forms have no thank-you / next-step.** Submit, Booking, Partner, Report — all POST and presumably show a JS-rendered "success" toast. No `/submit/thank-you` page (which means no conversion event in any analytics, no remarketing pixel, no upsell to "while you wait, follow us / subscribe / browse similar artists").

**S-5.4 — Conflicting CTAs above the fold.** Homepage marquee shows: "Become a Partner | Technology Partners Wanted | Broadcast Sponsors Wanted | Festival Partners Wanted" — four flavors of the same CTA, no hierarchy. Pick one primary CTA per surface; demote the rest.

**S-5.5 — "Visual Tip Jar" modal auto-shows on /search.** Confirmed during e2e. Modal-on-arrival before any user intent kills trust. A/B will show 2–4× higher dismissal vs. dwell-triggered.

**S-5.6 — No social proof in checkout flows.** Submit page sidebar lists what you feature ("Live Visuals · Projection Mapping · AI & Generative · …"), but no "We've featured 56 projects from 20 artists in 9 countries" trust line. Numbers convert.

**S-5.7 — No A/B testing infrastructure.** Cloudflare Workers can do edge-based A/B with KV. Without it, every CRO change is a guess.

**S-5.8 — Loop pack download has no monetization rails.** One pack listed; download is direct (no email gate, no Stripe gate, no analytics on downloads). At minimum: gate behind email capture (free + lead magnet) or Stripe checkout (revenue).

### 2.6 Growth Strategy

**S-6.1 — No clear growth model.** SaaS metrics (CAC/LTV) don't apply, but a media/marketplace model needs:
- **Reach metric:** unique visitors (CF gives this — track)
- **Engagement metric:** newsletter subs / repeat visits (don't have)
- **Conversion metric:** submissions / partner inquiries / loop pack downloads (don't measure)
- **Revenue metric:** sponsor revenue / pack sales (don't exist yet)

You can't optimize what you don't measure.

**S-6.2 — Channel mix appears 100% organic.** No paid testing has been run (or none is documented). Even $5/day on IG Ads testing creative for "submit your VJ work" would generate signal in a week. Worth a 30-day learning budget.

**S-6.3 — Distribution leverage in the listed artists.** Each of your 20 listed artists has their own audience (10K–500K each on social). A simple "share badge" they can put on their site / IG bio — *"Featured on VJs TV"* with a dofollow link — would generate organic referral and backlinks at zero cost.

**S-6.4 — Festival partnerships are unstructured.** 24 events listed; zero have a formal "VJs TV is the official media partner of X" badge agreement. This is the single biggest underused asset for both backlinks and audience growth in this niche.

**S-6.5 — No content velocity flywheel.** No editorial calendar, no "what's broadcasting tonight" schedule emails, no behind-the-scenes content for the streaming infrastructure (huge nerd appeal — VJs love the meta-story).

---

## 3. GROWTH OPPORTUNITIES — RANKED BY IMPACT × FEASIBILITY

| # | Opportunity                                                          | Impact | Effort | Confidence |
|---|----------------------------------------------------------------------|--------|--------|------------|
| 1 | Wire newsletter to a real ESP + free loop pack lead magnet           | HIGH   | M      | HIGH       |
| 2 | Fix `search.json` to index real collections                          | HIGH   | S      | HIGH       |
| 3 | Programmatic pages: by-country / by-technology / by-event-type       | HIGH   | M      | HIGH       |
| 4 | Add GA4 / PostHog + funnel + thank-you pages                         | HIGH   | M      | HIGH       |
| 5 | Loop pack Stripe checkout + signed Cloudflare Stream                 | HIGH   | L      | MEDIUM     |
| 6 | "Featured on VJs TV" embeddable badge for artists/studios            | MEDIUM | S      | HIGH       |
| 7 | Fix CWV (drop jQuery/Revolution/preloader) — see AUDIT.md            | HIGH   | L      | HIGH       |
| 8 | FAQ / HowTo / Topic-cluster pages ("Best VJ software 2026", etc.)    | HIGH   | M      | MEDIUM     |
| 9 | Festival "official media partner" outreach + badge program           | MEDIUM | M      | MEDIUM     |
| 10 | Hero rewrite: explicit positioning + above-fold value prop           | MEDIUM | S      | HIGH       |
| 11 | Strategic robots.txt rewrite (block CCBot, etc.)                     | LOW    | S      | HIGH       |
| 12 | About page (founder story / manifesto)                               | MEDIUM | S      | HIGH       |
| 13 | A/B testing harness on Cloudflare Workers + KV                       | MEDIUM | M      | MEDIUM     |
| 14 | Hreflang + secondary language (pt-BR first)                          | HIGH   | L      | MEDIUM     |

---

## 4. TASK BREAKDOWN

The tasks are created in the project task system (see chat). For each I include the priority, expected impact and effort:

| Task                                                | Priority | Impact | Effort |
|-----------------------------------------------------|----------|--------|--------|
| Tech SEO foundation + programmatic pages            | P0       | High   | M      |
| Conversion funnel: ESP, lead magnet, analytics, A/B | P0       | High   | M–L    |
| API consolidation + security hardening              | P0       | Crit   | M      |
| Performance slim-down + strict CSP                  | P1       | High   | L      |
| Streaming hardening + asset externalization         | P1       | Crit   | L      |
| Cleanup, docs, schema validation, CI/CD             | P2       | Med    | M      |

---

## 5. STRATEGIC ROADMAP

### Week 1–2 — Quick wins (no design changes, mostly engineering)
1. **Stop the bleeding.** Rotate YouTube stream keys; reconcile production CSP; pick one API layer.
2. **Fix internal search** (`search.json` over real collections) — single biggest UX bug in the site.
3. **Wire newsletter to a real ESP** (Buttondown $9/mo, or Resend free tier) + a `/thank-you` page.
4. **Add GA4 (or Plausible / PostHog)** + define & fire conversion events on submit/booking/partner forms.
5. **Hero rewrite** — explicit positioning sentence.
6. **Delete `assets/revolution/`** — instant CWV win.

### Month 1 — Foundation
1. **Lock down forms** with Turnstile + origin-locked CORS + rate limiter.
2. **AI moderation hardened** — structured output, fail-closed, sanitized prompts.
3. **Programmatic SEO pages live**: by-country, by-technology, by-event-type — auto-generated from existing collection data.
4. **FAQ schema + 3–5 cornerstone "answer" pages** (Best VJ software 2026, How to projection map, What is a VJ).
5. **Free loop pack lead magnet** behind email gate (replaces fake newsletter form).
6. **Drop jQuery + Bootstrap JS + decompose `index.html`** (CWV pass).

### Month 2–3 — Scaling
1. **Loop pack monetization**: Stripe checkout, signed Cloudflare Stream URLs, externalize all videos to R2.
2. **"Featured on VJs TV" embeddable badge** + outreach to all listed artists for backlinks.
3. **Festival "official media partner" program** — formal agreement template, badge artwork, announcement post.
4. **Editorial calendar**: weekly "what's broadcasting" newsletter; monthly artist interview; event recaps.
5. **A/B testing harness** on Cloudflare Workers + KV.
6. **Streaming infra hardening** (sign schedule.json, drop docker.sock from scheduler, R2 storage).
7. **Sponsor program ramp** — use real analytics dashboard on `/partners/` as the pitch deck.
8. **Add `pt-BR` localisation** — Brazilian VJ scene is enormous; first language to add.
9. **CI/CD + schema validation + Lighthouse budget enforced on every PR.**

— *End of growth audit. See chat for the proposed task list.*
