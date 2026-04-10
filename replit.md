# VJs TV - Global Broadcast Network for VJ Culture

## Overview
VJs TV is a Jekyll-based platform for VJ culture and audiovisual performances. It serves as the platform/stage layer (broadcasting, discovery, project infrastructure), while VJSMag (vjsmag.com) handles editorial/media content.

## Tech Stack
- **Language:** Ruby 3.2
- **Framework:** Jekyll 4.3.x (static site generator)
- **Plugins:** jekyll-feed
- **Styling:** Bootstrap + custom CSS (assets/css/vjstv.css)
- **Fonts:** Barlow Condensed (primary), Orbitron (accents) (Google Fonts)
- **Design:** NTS.live-inspired dark cyberpunk — flat design, 0px border-radius, dense layouts, #050505 black, ultraviolet/cyan/magenta accents

## Collections
- `_vjs/` - VJ artist profiles (renders to /artists/:name)
- `_projects/` - Audiovisual projects (renders to /projects/:name)
- `_events/` - Events and performances (renders to /events/:name)
- `_studios/` - Studios and installations (renders to /studios/:name)
- `_technology/` - VJ technology and tools (renders to /technology/:name)
- `_sponsors/` - Sponsors and brand partners (renders to /sponsors/:name)

## Pages
- `/` - Homepage: NTS-style live broadcast strip (2 channels), full-bleed hero with sidebar thumbnails, VJs TV Picks horizontal scroll, scrolling sponsor ticker, animated stats counters, featured artists grid, loop packs marketplace, editorial project grid, technology section, sponsors, CTA
- `/live` - Live broadcast page with 3-channel tabs (CH.1 LIVE, CH.2 LOOP GALLERY, CH.3 VJ EDUCATION), dynamic programming grid fetching schedule.json, NOW PLAYING/NEXT UP per channel, Vimeo-powered loop gallery with genre filters, countdown timer, cinema mode
- `/artists` - Artist directory with 3-dropdown JS filter (Style / Tech / Country), neon initials cards, country flags
- `/projects` - Project index with JS filter by type + sort by date; all 24 projects have real Vimeo IDs → thumbnails fetched live via Vimeo API
- `/events` - Events split into Upcoming / Archive sections, with date badges
- `/studios` - Studios and installations
- `/technology` - Technology directory with JS category filter
- `/sponsors` - Sponsors and partners
- `/search` - Global search across all collections (client-side, no server needed)
- `/submit` - Project submission page (form → Cloudflare Worker → GitHub Issues)
- `/partners` - Sponsor pitch page with interactive modals, partnership tiers, particle background, contact form, Cloudflare analytics stats bar, live page view counter, and live audience charts (unique visitors line chart + country traffic table)

## Key Files
- `_config.yml` - Jekyll configuration with collections and `api_url` setting
- `_data/navigation.yml` - Main navigation menu
- `_data/general_settings.yml` - Site-wide settings and branding
- `assets/css/vjstv.css` - Custom dark/neon theme CSS (~5780 lines)
- `_layouts/default.html` - Base layout with skip-to-content link
- `_layouts/vjs-detail.html` - Shared detail page layout for all collections (semantic h2 sidebar headings)
- `_includes/vjstv-footer.html` - Custom footer with floating sidebar, tip jar modal, mobile nav
- `_includes/cards/` - Reusable card components (artist, project, event, studio, technology, sponsor)
- `_includes/layouts/nav/nav-3.html` - Dark navigation bar (used across all pages)
- `_includes/core/head/meta-seo-tags.html` - SEO meta tags, canonical URL, robots directives
- `_includes/core/head/meta-og-tags.html` - Open Graph, Twitter Cards, JSON-LD @graph structured data
- `robots.txt` - Auto-generated robots.txt with sitemap reference
- `sitemap.xml` - Auto-generated XML sitemap (192 URLs across all collections)
- `sitemap.html` - Human-readable HTML sitemap with structured sections
- `_headers` - Cloudflare security + caching headers
- `schedule/schedule.json` - Central programming schedule for all 3 live channels (UTC time blocks, special events)

## Accessibility
- Skip-to-content link (keyboard-accessible, cyan highlight)
- `:focus-visible` outlines on all interactive elements (cyan)
- ARIA labels on buttons, modals, navigation landmarks
- `aria-hidden="true"` on decorative icons
- `role="dialog"` on tip jar modal
- `prefers-reduced-motion` media query disables all animations

## SEO
- **Canonical URLs** on every page (`<link rel="canonical">`)
- **Meta robots** with `max-image-preview:large`, `max-snippet:-1`, `max-video-preview:-1`
- **404 pages** have `noindex, follow` to prevent index pollution
- **robots.txt** at `/robots.txt` — auto-generated, references sitemap
- **XML sitemap** at `/sitemap.xml` — auto-generated from all collections (192 URLs)
- **JSON-LD structured data** (`@graph`): Organization, WebSite, WebPage on every page, plus:
  - `Person` for artist pages (`_vjs/`)
  - `CreativeWork` + `VideoObject` for project pages (`_projects/`)
  - `Event` for event pages (`_events/`)
  - `Organization` for studio pages (`_studios/`)
  - `SoftwareApplication` for technology pages (`_technology/`)
- **Open Graph** with dynamic `og:type` (website/video.other/event), absolute image URLs, locale
- **Twitter Cards** with `summary_large_image`, creator handle
- **Heading hierarchy**: One H1 per page, semantic H2 sidebar headings
- **Security headers**: HSTS, X-Content-Type-Options, Permissions-Policy, immutable caching

## Performance
- `requestAnimationFrame` throttled scroll handler for progress bar
- Passive scroll event listeners
- `will-change` hints on animated elements
- IntersectionObserver visibility gating on meter bar animation
- `preconnect` for Google Fonts and Vimeo
- `preload` for critical CSS (vjstv.css)
- `defer` on all non-critical scripts (jQuery loads synchronously, everything else deferred)
- Runtime lazy loading for below-fold images via `loading="lazy"` attribute
- Immutable cache headers for static assets (CSS, JS, images, fonts)

## API Architecture

### Production: Cloudflare Worker (`website.guillaumelauzier.workers.dev`)
- **All API endpoints** are served by a single Cloudflare Worker
- **GitHub API:** Uses `GITHUB_TOKEN` secret (set in Worker Settings > Variables and Secrets)
- **Analytics:** Uses `CF_API_TOKEN` and `CF_ZONE_ID` secrets
- **AI Moderation:** Uses Workers AI binding (variable name: `AI`) for auto-moderating submissions
- **Email Confirmation:** Uses Cloudflare Email Service binding (variable name: `SEB`, Unrestricted destination) with `cloudflare:email` module
- **Form endpoints:**
  - `POST /api/submit` — project submission → AI moderation → GitHub Issue + email confirmation
  - `POST /api/report` — issue report → AI moderation → GitHub Issue + email confirmation
  - `POST /api/partner` — partnership enquiry → AI moderation → GitHub Issue + email confirmation
  - `POST /api/booking` — booking request / studio enquiry / commission → AI moderation → GitHub Issue + email confirmation
- **Analytics endpoints:**
  - `GET /api/analytics` — Cloudflare monthly page views
  - `GET /api/analytics/charts` — daily traffic + country data
- **Jekyll config:** `api_url` in `_config.yml` sets the Worker URL; all forms use `{{ site.api_url }}` in templates

### Development: Express Server (`api/server.js`)
- **Local dev only:** `node api/server.js` on port 5000, serves static `_site/` files
- **No API routes:** All API calls go directly to the Cloudflare Worker (even in dev)
- **Jekyll:** Auto-runs `jekyll build --watch --incremental`

### Complete Worker File (`functions/worker.js`)
- **This is the complete, deployable Worker code** — paste into Cloudflare Worker editor
- Contains ALL routes: `/api/submit`, `/api/report`, `/api/partner`, `/api/booking`, `/api/analytics`, `/api/analytics/charts`, `/api/health`
- Includes AI moderation, GitHub Issue creation, and Cloudflare Email Service confirmation on all form endpoints

### Reference: Cloudflare Pages Functions (`functions/api/`)
- Individual endpoint reference files (not deployed directly — use `functions/worker.js` instead)
- `functions/api/submit.js`, `report.js`, `partner.js`, `booking.js`

### Required Cloudflare Worker Secrets
- `GITHUB_TOKEN` — GitHub Personal Access Token with `repo` scope (for creating Issues)
- `CF_API_TOKEN` — Cloudflare API token with Analytics read permission (for analytics endpoints)
- `CF_ZONE_ID` — Cloudflare zone ID for vjstv.com (for analytics endpoints)

### Required Cloudflare Worker Bindings
- `AI` — Workers AI binding (for content moderation)
- `SEB` — Email Service binding, Unrestricted destination (for email confirmations via `cloudflare:email`)

### Endpoints
- `POST /api/submit` — create submission Issue (fields: artist, project_title, email, video_url, description, category)
- `POST /api/report` — report issue (fields: reporter_name, description, reporter_email, project_title, project_url)
- `POST /api/partner` — partnership enquiry (fields: full_name, email, message, company, tier)
- `POST /api/booking` — booking/studio/commission enquiry (fields: subject, profile_type, service_type, event_name, event_date, location, budget, description, contact_name, contact_email, organisation)
- `GET /api/analytics` — monthly page views from Cloudflare
- `GET /api/analytics/charts` — daily traffic chart data + top countries

### Security
- Workers AI moderation on all form submissions (spam, offensive content, phishing, bot detection)
- Honeypot spam fields on all forms
- Input trimming and length caps
- CORS headers on all endpoints

## Cloudflare Analytics & Dynamic Pricing
- **Backend:** `/api/analytics` endpoint fetches from Cloudflare GraphQL API
- **Caching:** 10-minute in-memory cache in Worker
- **Frontend:** `vjsLoadAnalytics()` on sponsors/partners pages
- **Pricing tiers:** Base prices × visitor multiplier
- **Stats bar:** 97 community members, 50 countries, 23 events

## Development
```
node api/server.js  # Dev server: static files + Jekyll watch on port 5000
```
All API calls go to `https://website.guillaumelauzier.workers.dev` (configured in `_config.yml` as `api_url`).

## Deployment
- **Site:** Static Jekyll build, deploy to GitHub Pages / Cloudflare Pages / any static host
- **API:** Cloudflare Worker at `website.guillaumelauzier.workers.dev`
- Build: `bundle exec jekyll build`
- Public directory: `_site`

## Adding Content
Each collection item uses `layout: vjs-detail` and has specific frontmatter fields. See existing items in each collection directory for examples.

### Artist Images
Artists can include a profile image by adding an `image:` field to their frontmatter:
```yaml
image: "/assets/images/artists/artist-name.jpg"
```

If no image is provided, the artist card displays a neon initial badge instead.

## Hero Section Architecture
- `index.html` contains the hero player, sidebar, and chyron bar
- `VJS_PROJECT_POOL` array is built at Jekyll build time from all projects with Vimeo IDs
- Fisher-Yates shuffle picks 8 random projects for the sidebar on each page load
- First pick is stored in `window._vjsFirstPick` and applied to the chyron AFTER chyron DOM elements exist
- `heroPlay(card)` updates the player/chyron when sidebar cards are clicked

## Vimeo Thumbnail Loading
- Global loader in `_includes/core/scripts/scripts.html` uses oEmbed API
- Elements with `class="vjs-vimeo-thumb" data-vimeo="ID"` auto-load thumbnails
- Hero sidebar cards load thumbnails via the same oEmbed API at 200px width

## Excluded Legacy Files
The original Snowlake theme demo content (portfolios, blogs, shop, services, etc.) is excluded via `_config.yml` exclude list but remains in the repo for reference.
