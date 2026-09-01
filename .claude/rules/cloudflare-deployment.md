---
paths:
  - wrangler.jsonc
  - vite.config.ts
  - src/server.ts
---

# Cloudflare Deployment Rules

## Custom Domains vs Routes

- Prefer `custom_domain: true` over `routes` with `zone_name` — custom domains auto-create DNS records and SSL certs; routes require manual DNS setup
- Routes with `zone_name` need a pre-existing proxied DNS record or requests fail with `ERR_NAME_NOT_RESOLVED`

```jsonc
// Good: auto-creates DNS + SSL
"routes": [{ "pattern": "app.example.com", "custom_domain": true }]

// Fragile: requires manual DNS record
"routes": [{ "pattern": "app.example.com/*", "zone_name": "example.com" }]
```

## HTTP→HTTPS Enforcement

- NEVER use Cloudflare "Redirect from HTTP to HTTPS" redirect rule template — it intercepts requests before Workers and causes 301 self-redirect loops on Worker custom domains
- USE "Always Use HTTPS" toggle in SSL/TLS → Edge Certificates instead — operates at TLS layer, doesn't conflict with Workers

## SSL/TLS Mode

- Zone SSL/TLS encryption mode MUST be **Full** or **Full (strict)**, never Flexible
- Flexible + any HTTPS redirect = infinite redirect loop

## Vite Plugin Environments (`@cloudflare/vite-plugin`)

- The plugin bakes ONE wrangler config into `dist/server/wrangler.json` at build time, and `.wrangler/deploy/config.json` redirects every `wrangler deploy` to that built config
- By default that is the **top-level (dev)** config — even `wrangler deploy --env production` is silently redirected to the dev worker
- Production builds must opt in via `DEPLOY_ENV=production` (set by the `build:production` script); `vite.config.ts` then points the plugin's `configPath` at `wrangler.prod.jsonc`
- Each wrangler file is standalone, one environment per file (no `env:` blocks): `wrangler.jsonc` = dev (`wspolniak-dev`), `wrangler.prod.jsonc` = prod (`wspolniak`, wspolniak.com)

## Deploy Script Pattern

```jsonc
// package.json
"build:production": "DEPLOY_ENV=production vite build --mode production && node scripts/inject-sw-version.mjs",
"deploy:production": "pnpm run build:production && wrangler deploy --env=''"
```

Verify before shipping (no upload): `npx wrangler deploy --env='' --dry-run` must print name `wspolniak` and the wspolniak.com route.

## Debugging "Too Many Redirects"

1. `curl -sI https://domain/path` — check if response is 301 to same URL
2. If `server: cloudflare` with no app headers → request never reached Worker
3. Check: Redirect Rules > Page Rules > SSL mode > Worker binding
4. Disable redirect rules first — most common culprit with Workers
