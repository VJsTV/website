# VJs TV - Global Broadcast Network for VJ Culture

## Overview
VJs TV is a Jekyll-based platform for VJ culture and audiovisual performances. It serves as the platform/stage layer (broadcasting, discovery, project infrastructure), while VJSMag (vjsmag.com) handles editorial/media content.

## Tech Stack
- **Language:** Ruby 3.2
- **Framework:** Jekyll 4.3.x (static site generator)
- **Plugins:** jekyll-feed
- **Styling:** Bootstrap + custom CSS (assets/css/vjstv.css)
- **Fonts:** Space Grotesk, Inter, Orbitron (Google Fonts)
- **Design:** Dark theme with ultraviolet/electric blue/magenta neon aesthetic

## Collections
- `_vjs/` - VJ artist profiles (renders to /artists/:name)
- `_projects/` - Audiovisual projects (renders to /projects/:name)
- `_events/` - Events and performances (renders to /events/:name)
- `_studios/` - Studios and installations (renders to /studios/:name)
- `_technology/` - VJ technology and tools (renders to /technology/:name)
- `_sponsors/` - Sponsors and brand partners (renders to /sponsors/:name)

## Pages
- `/` - Homepage (hero, live broadcast, artists, projects, studios, tech, sponsors, CTA)
- `/live` - Live broadcast page with player and schedule
- `/artists` - VJ artist directory
- `/projects` - Global index of VJ work
- `/events` - Events and performances
- `/studios` - Studios and installations
- `/technology` - VJ technology and tools
- `/sponsors` - Sponsors and partners
- `/submit` - Project submission page

## Key Files
- `_config.yml` - Jekyll configuration with collections
- `_data/navigation.yml` - Main navigation menu
- `_data/general_settings.yml` - Site-wide settings and branding
- `assets/css/vjstv.css` - Custom dark/neon theme CSS
- `_layouts/vjs-detail.html` - Shared detail page layout for all collections
- `_includes/cards/` - Reusable card components (artist, project, event, studio, technology, sponsor)
- `_includes/layouts/nav/nav-3.html` - Dark navigation bar (used across all pages)
- `_includes/layouts/footer/footer-1.html` - Footer template

## Development
```
bundle exec jekyll serve --host 0.0.0.0 --port 5000
```

## Deployment
- Target: static
- Build: `bundle exec jekyll build`
- Public directory: `_site`

## Adding Content
Each collection item uses `layout: vjs-detail` and has specific frontmatter fields. See existing items in each collection directory for examples.

## Excluded Legacy Files
The original Snowlake theme demo content (portfolios, blogs, shop, services, etc.) is excluded via `_config.yml` exclude list but remains in the repo for reference.
