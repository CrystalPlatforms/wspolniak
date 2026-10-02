---
title: Deploy i migracje
---

Wspólniak ma dwa środowiska — **dev** (`wspolniak-dev`) i **production** (`wspolniak.com`). Oba na Cloudflare Workers, każde z osobną bazą Neon i osobnymi migracjami Drizzle.

## Dwa konfigi Drizzle

- `drizzle-dev.config.ts` — czyta `.dev.vars`, migracje do `src/db/migrations/dev/`
- `drizzle-production.config.ts` — czyta `.production.vars`, migracje do `src/db/migrations/production/`

```bash
# Dev
pnpm db:dev:generate      # generuje migracje
pnpm db:dev:migrate       # aplikuje na dev bazę

# Production (tylko ręcznie, przed deployem produkcyjnym)
pnpm db:production:migrate
```

## Dwa wranglery

Build produkcyjny ustawia `DEPLOY_ENV=production`, a `vite.config.ts` piecze wtedy `wrangler.prod.jsonc` (domena `wspolniak.com`). Dev deploy używa top-level `wrangler.jsonc` (`wspolniak-dev`).

```json
{
	"name": "wspolniak-dev",
	"compatibility_date": "2025-09-02",
	"compatibility_flags": ["nodejs_compat"]
}
```

## Sekrety

- `.dev.vars` / `.production.vars` (gitignored) — lokalnie
- Cloudflare dashboard — sekrety zdalne produkcji
- `APP_URL` — krytyczny dla URL-i callbacków auth

> **Uwaga:** przed deployem produkcyjnym zawsze puść najpierw `pnpm db:production:migrate` (migracja przed nowym kodem, żeby stary worker nie dostał nowej schemy).
