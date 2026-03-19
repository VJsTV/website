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
- `/live` - Live broadcast page with player and schedule
- `/artists` - Artist directory with 3-dropdown JS filter (Style / Tech / Country), neon initials cards, country flags
- `/projects` - Project index with JS filter by type + sort by date; all 24 projects have real Vimeo IDs → thumbnails fetched live via Vimeo API
- `/events` - Events split into Upcoming / Archive sections, with date badges
- `/studios` - Studios and installations
- `/technology` - Technology directory with JS category filter
- `/sponsors` - Sponsors and partners
- `/search` - Global search across all collections (client-side, no server needed)
- `/submit` - Project submission page (form → Express API → GitHub Issues)
- `/partners` - Sponsor pitch page with interactive modals, partnership tiers, particle background, contact form, Cloudflare analytics stats bar, live page view counter, and live audience charts (unique visitors line chart + country traffic table)

## Key Files
- `_config.yml` - Jekyll configuration with collections
- `_data/navigation.yml` - Main navigation menu
- `_data/general_settings.yml` - Site-wide settings and branding
- `assets/css/vjstv.css` - Custom dark/neon theme CSS (~4090 lines)
- `_layouts/default.html` - Base layout with skip-to-content link
- `_layouts/vjs-detail.html` - Shared detail page layout for all collections
- `_includes/vjstv-footer.html` - Custom footer with floating sidebar, tip jar modal, mobile nav
- `_includes/cards/` - Reusable card components (artist, project, event, studio, technology, sponsor)
- `_includes/layouts/nav/nav-3.html` - Dark navigation bar (used across all pages)
- `_includes/core/head/meta-seo-tags.html` - SEO meta tags, JSON-LD schema
- `_includes/core/head/meta-og-tags.html` - Open Graph + Twitter Card meta

## Accessibility
- Skip-to-content link (keyboard-accessible, cyan highlight)
- `:focus-visible` outlines on all interactive elements (cyan)
- ARIA labels on buttons, modals, navigation landmarks
- `aria-hidden="true"` on decorative icons
- `role="dialog"` on tip jar modal
- `prefers-reduced-motion` media query disables all animations

## Performance
- `requestAnimationFrame` throttled scroll handler for progress bar
- Passive scroll event listeners
- `will-change` hints on animated elements
- IntersectionObserver visibility gating on meter bar animation
- `preconnect` for Google Fonts

## Cloudflare Analytics & Dynamic Pricing
- **Secrets required:** `CF_API_TOKEN` (Read Analytics permission), `CF_ZONE_ID` (Cloudflare domain zone tag)
- **Backend:** `/api/analytics` endpoint fetches from Cloudflare GraphQL API `httpRequests1dGroups`:
  - Queries last 30 days of page views using dynamic date range
  - GraphQL query: `query { viewer { zones(filter: {zoneTag: "ZONE_ID"}) { httpRequests1dGroups(limit: 30, filter: {date_geq: "DATE", date_leq: "DATE"}) { sum { pageViews } } } } }`
  - Returns `monthlyVisitors` (sum of all page views in 30 days)
  - Includes 8-second timeout to prevent hanging requests
- **Caching:** 10-minute in-memory cache to avoid rate limiting
- **Frontend:** `vjsLoadAnalytics()` on sponsors/partners pages:
  - Fetches `/api/analytics` on page load
  - Updates pricing based on visitor multiplier (1x, 2x, 3x, 5x)
  - Shows "🔥 Based on X monthly page views" label above sponsorship tiers
  - Gracefully handles API failures by showing base prices
- **Pricing tiers:** Base prices (Title: $5K, Tech: $2.5K, Creative: $1.5K, Equipment: $1K) × visitor multiplier
- **Stats bar:** 97 community members, 50 countries (static), 23 events (static), unique visitors (removed from display)
- **Testing:** API returns `{"monthlyVisitors": number, "cached": false/true}` on success; fallback on timeout/error

## API & Form System (Dual Architecture)

### Production: Cloudflare Pages Functions (`functions/api/`)
- **Deployment:** `functions/` directory auto-detected by Cloudflare Pages, runs as serverless Workers
- **GitHub API:** Uses `GITHUB_TOKEN` environment variable (set in Cloudflare Pages dashboard)
- **Analytics:** Uses `CF_API_TOKEN` and `CF_ZONE_ID` environment variables
- **Files:**
  - `functions/api/submit.js` → `POST /api/submit` — project submission → GitHub Issue
  - `functions/api/report.js` → `POST /api/report` — issue report → GitHub Issue
  - `functions/api/partner.js` → `POST /api/partner` — partnership enquiry → GitHub Issue
  - `functions/api/analytics.js` → `GET /api/analytics` — Cloudflare monthly page views
  - `functions/api/analytics/charts.js` → `GET /api/analytics/charts` — daily traffic + country data
  - `functions/api/health.js` → `GET /api/health` — health check

### Development: Express Server (`api/server.js`)
- **Local dev:** `node api/server.js` on port 5000, serves static `_site/` + API endpoints
- **Uses:** Replit Connectors SDK for GitHub API (only works in Replit environment)
- **Jekyll:** Auto-runs `jekyll build --watch --incremental`

### Required Cloudflare Pages Environment Variables
- `GITHUB_TOKEN` — GitHub Personal Access Token with `repo` scope (for creating Issues)
- `CF_API_TOKEN` — Cloudflare API token with Analytics read permission
- `CF_ZONE_ID` — Cloudflare zone ID for vjstv.com

### Endpoints
- `POST /api/submit` — create submission Issue (fields: artist, project_title, email, video_url, description, category)
- `POST /api/report` — report issue (fields: reporter_name, description, reporter_email, project_title, project_url)
- `POST /api/partner` — partnership enquiry (fields: full_name, email, message, company, tier)
- `GET /api/analytics` — monthly page views from Cloudflare
- `GET /api/analytics/charts` — daily traffic chart data + top countries
- `GET /api/health` — health check

### Security
- Honeypot spam fields on all forms
- Input trimming and length caps
- CORS headers on all endpoints

## Development
```
node api/server.js  # Single server: Express (API + static) + Jekyll watch on port 5000
```

## Deployment
- Target: static
- Build: `bundle exec jekyll build`
- Public directory: `_site`

## Adding Content
Each collection item uses `layout: vjs-detail` and has specific frontmatter fields. See existing items in each collection directory for examples.

### Artist Images
Artists can include a profile image by adding an `image:` field to their frontmatter:
```yaml
image: "/assets/images/artists/artist-name.jpg"
```

If no image is provided, the artist card displays a neon initial badge instead. To add artist images:
1. Upload image files to `assets/images/artists/` (JPEG or PNG recommended)
2. Add `image:` field pointing to the file path
3. The component automatically displays the image on the artists directory page

## Hero Section Architecture
- `index.html` contains the hero player, sidebar, and chyron bar
- `VJS_PROJECT_POOL` array is built at Jekyll build time from all projects with Vimeo IDs
- Fisher-Yates shuffle picks 8 random projects for the sidebar on each page load
- First pick is stored in `window._vjsFirstPick` and applied to the chyron AFTER chyron DOM elements exist (avoids null reference race condition)
- `heroPlay(card)` updates the player/chyron when sidebar cards are clicked; guards against missing location data

## Vimeo Thumbnail Loading
- Global loader in `_includes/core/scripts/scripts.html` uses oEmbed API: `vimeo.com/api/oembed.json?url=...&width=480`
- Elements with `class="vjs-vimeo-thumb" data-vimeo="ID"` auto-load thumbnails
- Failed fetches clear the loaded flag to allow retries
- Hero sidebar cards load thumbnails via the same oEmbed API at 200px width

## Excluded Legacy Files
The original Snowlake theme demo content (portfolios, blogs, shop, services, etc.) is excluded via `_config.yml` exclude list but remains in the repo for reference. Also excluded: `.local`, `.replit`, `attached_assets`, `node_modules`, `vendor`, `replit.md` to prevent Jekyll watch loops.
