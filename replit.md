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
- `/business-model` - Sponsor pitch page with interactive modals, partnership tiers, particle background, and contact form

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

## Submission System (GitHub Issues Integration)
- **Unified Server:** `api/server.js` — Express on port 5000 serves both static site (`_site/`) and API endpoints
- **Jekyll Build:** Express runs `jekyll build --watch --incremental` automatically; no separate Jekyll server needed
- **Frontend:** `submit/index.html` — form POSTs to `/api/submit` (same origin, no CORS issues)
- **GitHub Integration:** Uses Replit Connectors SDK (`@replit/connectors-sdk`) for authenticated GitHub API calls
- **Repo:** `VJsTV/website` — submissions create Issues with labels (`submission`, type-based)
- **Workflow:** Form submission → Express API → GitHub Issue created with Jekyll front matter
- **Approval:** Add `approved` label in GitHub Issues → can trigger GitHub Action to auto-generate `_projects/*.md`
- **Endpoints:**
  - `POST /api/submit` — create submission Issue (rate limited: 3/5min)
  - `POST /api/report` — report issue on any detail page (rate limited: 3/2min)
  - `POST /api/partner` — partnership enquiry from sponsors page (rate limited: 3/5min, label: `partnership`)
  - `GET /api/projects` — fetch approved Issues
  - `GET /api/health` — health check
- **Report Feature:** "Report an Issue" button in sidebar of all `vjs-detail` pages + footer of every page; modal → creates GitHub Issue with `report` label
- **Partnership Form:** "Send Partnership Enquiry" on `/sponsors/` and "Get in Touch" on `/business-model/` both POST to `/api/partner` → creates GitHub Issue titled "SPONSORS & PARTNERS – {company}" with `partnership` label
- **Security:** Honeypot spam field, per-IP rate limiting, input trimming/length caps, 50KB body limit

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
