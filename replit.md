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
- **Homepage (`/`)**: Features a live broadcast strip, full-bleed hero section, VJs TV Picks, sponsor ticker, animated stats, and various content grids.
- **Live Broadcast Page (`/live`)**: Offers three channels (CH.1 LIVE, CH.2 LOOP GALLERY, CH.3 VJ EDUCATION) with dynamic programming, Vimeo-powered loop galleries, and a cinema mode.
- **Directory Pages (`/artists`, `/projects`, `/events`, `/studios`, `/technology`, `/sponsors`)**: Provide filtered and sortable listings of content.
- **Utility Pages (`/search`, `/submit`, `/partners`)**: Client-side search, project submission form, and a sponsor pitch page with interactive elements and real-time analytics.

Accessibility features include skip-to-content links, `:focus-visible` outlines, ARIA labels, and `prefers-reduced-motion` support. SEO is a core focus, implemented through canonical URLs, meta robots tags, XML/HTML sitemaps, comprehensive JSON-LD structured data for various content types, dynamic meta descriptions, Open Graph, Twitter Cards, and strict heading hierarchy. Performance is optimized with `requestAnimationFrame` throttling, passive scroll listeners, `will-change` hints, `IntersectionObserver`, `preconnect`/`dns-prefetch`/`preload` for critical assets, `defer` for non-critical scripts, and runtime lazy loading.

The API architecture is dual-mode:
- **Production**: A single Cloudflare Worker handles all API endpoints, including form submissions (moderated by Workers AI, creating GitHub Issues, and sending email confirmations), and Cloudflare Analytics data retrieval.
- **Development**: An Express server (`api/server.js`) runs locally, serving static files and managing Jekyll watch. It includes health checks, gzip compression, caching, and graceful shutdown.

## External Dependencies
- **Jekyll Plugins**: `jekyll-feed`
- **Styling**: Bootstrap
- **Fonts**: Google Fonts (Barlow Condensed, Orbitron)
- **Video Hosting/Embedding**: Vimeo, YouTube
- **Form Submission/Backend**: Cloudflare Workers, GitHub Issues (for submissions), Cloudflare Email Service
- **Analytics**: Cloudflare Analytics API
- **AI Moderation**: Cloudflare Workers AI
- **Image/Thumbnail Loading**: Vimeo oEmbed API
- **Deployment**: GitHub Pages, Cloudflare Pages