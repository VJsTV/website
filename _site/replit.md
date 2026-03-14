# Snowlake Jekyll Theme

## Overview
A Jekyll static site (Snowlake v2 theme) with blog, portfolio, shop, and one-page layouts.

## Tech Stack
- **Language:** Ruby 3.2
- **Framework:** Jekyll 4.3.x (static site generator)
- **Plugins:** jekyll-feed, jekyll-paginate-v2, jekyll-archives
- **Syntax Highlighting:** Rouge + kramdown-parser-gfm

## Project Structure
- `_posts/` – Blog posts
- `_portfolio/` – Portfolio items
- `_shop_items/` – Shop items
- `_authors/` – Author pages
- `_layouts/` – Page layout templates
- `_includes/` – Reusable HTML partials
- `_data/` – YAML/JSON data files (navigation, settings, etc.)
- `assets/` – CSS, JS, images
- `_config.yml` – Jekyll configuration
- `_site/` – Built output (generated, not committed)

## Development
Run locally with:
```
bundle exec jekyll serve --host 0.0.0.0 --port 5000 --livereload
```

## Workflow
- **Start application** – Runs Jekyll dev server on port 5000 (webview)

## Deployment
- Target: static
- Build: `bundle exec jekyll build`
- Public directory: `_site`
