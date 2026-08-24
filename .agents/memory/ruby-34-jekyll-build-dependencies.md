---
name: Ruby 3.4 Jekyll build dependencies
description: Cloudflare Workers Builds uses Ruby 3.4, where Jekyll's older dependency chain needs explicit standard-library gems.
---

Cloudflare Workers Builds may run Jekyll under Ruby 3.4 even when local development uses an older Ruby. For this project, `csv` and `base64` must be declared explicitly because the Jekyll dependency chain loads them as libraries.

**Why:** The Cloudflare build can fail before Jekyll starts even though the same locked bundle builds locally.

**How to apply:** When changing the Jekyll bundle or build image, inspect Cloudflare logs for missing standard-library `LoadError`s and lock the missing gems explicitly rather than changing site templates.