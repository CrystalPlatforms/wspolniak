# INDEX.md — Project Map for AI Agents

> Generated: 2026-11-15 by /index-md. If older than 14 days, suggest running /index-md again.
> Read THIS file instead of scanning the repo. Never read files listed in § Secrets map.

## 1. Overview

**Wspólniak** is a private family photo-sharing service, self-hosted on Cloudflare — an open, ad-free alternative to Facebook/Google Photos/iCloud Shared Albums. One family = one instance = one admin; passwordless auth via magic links distributed by the admin outside the system; members install it as a PWA and get instant push notifications. Built on the TanStack Start on Cloudflare template: TanStack Start SSR frontend + Hono API backend on a single Worker, Neon PostgreSQL via Drizzle, Cloudflare Images for photos (auto HEIC conversion). Production runs at wspolniak.com (dev worker `wspolniak-dev`); UI and most docs are in Polish; license AGPL-3.0-or-later (SPDX header on every source file). In active production: feed, posts, comments, reactions, albums, calendar, chat (Durable Object + R2 attachments), video/YouTube, AI assistant (Groq), admin panel.

## 2. Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript strict (`tsc --noEmit` gate), ES2022 |
| Frontend | React 19, TanStack Start (SSR) + Router + Query + Form, file-based routes |
| Backend | Hono 4 on Cloudflare Workers (+ Durable Objects, R2, Cron triggers) |
| Database | Neon PostgreSQL (serverless) + Drizzle ORM + drizzle-kit |
| Storage/media | Cloudflare Images, R2 bucket `CHAT_ATTACHMENTS`, Web Push (VAPID) |
| Styling | Tailwind CSS v4, Shadcn/UI (new-york/Zinc), Radix, motion, dnd-kit, leaflet |
| AI | Groq API (`src/core/ai/`), streaming protocol, YouTube OAuth upload |
| Lint/format | Biome + 5 Grit plugins (`.biome-plugins/`) |
| Tests | Vitest + Testing Library + jsdom (~208 test files) |
| Tooling | pnpm 11, Vite 7 + `@cloudflare/vite-plugin`, wrangler 4, semantic-release, knip, taze, dotenvx |
| Mobile | `android/` — Kotlin/Gradle wrapper app (PRD in plans/) |

## 3. Directory map

| Path | Purpose |
|---|---|
| `src/server.ts` | CF Workers entry: `/api/*` → Hono, `/app/u/*` → auth Hono, rest → SSR; exports ChatRoom DO + `scheduled` |
| `src/start.tsx`, `src/router.tsx` | TanStack Start instance + router setup |
| `src/routes/` | File-based routes; `app/*` = logged-in app (feed, post.$id, albums, chat, calendar, ai, stats, admin, settings, video), `auth/`, `setup`, `share`, `shared-post.$id`, docs pages (`bugs.$slug`, `product.$slug`, `technical.$slug`) |
| `src/hono/` | API: `api.ts` mounts ~20 endpoint modules from `api/` (posts, comments, albums, chat, chat-attachments, calendar, ai, video, push, images, share, admin, auth, setup, health…); `factory.ts` = typed Hono; `middleware/` = auth, admin, rate-limit |
| `src/db/` | Domain modules (16: albums, bookmarks, calendar, chat, comments, health, identity, instance, mentions, pinned-posts, post-reactions, posts, push-delivery-events, push-subscriptions, stats, video-uploads); `schema.ts` aggregates tables; `setup.ts` = `initDatabase`/`getDb` singleton; `migrations/dev/` (36 sql) + `migrations/production/` (20 sql) |
| `src/db/{domain}/` | `table.ts` (Drizzle), `schema.ts` (Zod), `queries.ts`, `index.ts` (public API) |
| `src/core/` | errors (AppError/Result), feed, push, web-push, authorization, boot-splash, app-bootstrap, `functions/` (TanStack server fns: session, feed, maintenance, feature-flags), `middleware/auth`, `ai/` (Groq), `youtube/` (OAuth, crypto, upload) |
| `src/components/` | `app/` (feed, posts, comments, reactions, calendar, mentions), `chat/` (bubbles, polls, attachments), `glass/` (new: Liquid Glass UI — untracked, in progress), `ui/` (Shadcn — don't edit), `admin/`, `docs/`, `landing/`, `pwa/`, `video/`, `setup/`, `share/`, `theme/`, `maintenance/`, `auth/` |
| `src/chat/chat-room.ts` | ChatRoom Durable Object (WebSocket rooms) |
| `src/calendar/` | Cron job (D-0 posts from admin) + timezone logic |
| `src/pwa/` | Service-worker helpers, install/online/update hooks, offline guard |
| `src/images/` | Client upload pipeline: compress (Web Worker), shrink, upload (`UPLOAD_TIMEOUT_MS`) |
| `src/docs/` | Docs site engine + `content/{bugs,product,technical}/` = 34 user-facing Polish docs served at `/docs` |
| `src/test/` | Vitest setup, `cloudflare-workers-stub.ts` (DO stub), fake-xhr |
| `scripts/` | `inject-sw-version.mjs` (SW cache busting), `regenerate-admin-token.ts`, `trigger-calendar-job.ts` |
| `plans/` | PRDs/phasing plans (untracked) |
| `crs-assets/`, `crs-assets 2/` | Vendored react-bits/CRS theme assets (see §11 Gotchas #10) |
| `android/` | Android wrapper app (Gradle/Kotlin) |
| `public/` | `sw.js`, manifest.webmanifest, icons, emoji, logos |
| `.claude/` | CLAUDE.md template copy, `rules/` (15 scoped rule files), `agents/` (dd-i, dd-w, mvp-e), `commands/` (implement, verify-dd), `settings.json` (hooks) |
| `.github/` | `workflows/release.yml`, `ISSUE_TEMPLATE/tdd-vertical-slice.md` |

## 4. Key files & entry points

| File | Why it matters |
|---|---|
| `src/server.ts` | Worker entry; routing split; `initDatabase(env)` per request; HMR workaround (dynamic SSR import) — header says "DO NOT DELETE THIS FILE!!!" |
| `src/hono/api.ts` | Mounts all `/api/*` endpoint groups |
| `src/hono/factory.ts` | `createHono()` with `Env` bindings + `user` variable |
| `src/db/setup.ts` / `src/db/index.ts` | DB singleton + re-exports (`users`, `instanceConfig`) |
| `src/db/schema.ts` | Aggregated Drizzle schema — input for drizzle-kit |
| `src/routes/__root.tsx` | Root layout |
| `src/routeTree.gen.ts` | AUTO-GENERATED by TanStack Router — edits hard-blocked by PreToolUse hook |
| `worker-configuration.d.ts` | AUTO-GENERATED `Env` typings — blocked too; regenerate with `pnpm cf-typegen` |
| `src/env.d.ts` | Optional secret bindings declaration (YOUTUBE_*, GROQ_API_KEY, VAPID_*) |
| `src/scheduled.ts` | Cron branching: `7 * * * *` chat expiry, `0 6 * * *` calendar job |
| `wrangler.jsonc` / `wrangler.prod.jsonc` | Dev worker (`wspolniak-dev`) / prod (`wspolniak`, wspolniak.com); standalone files, no `env:` blocks |
| `vite.config.ts` | Picks wrangler config via `DEPLOY_ENV`; dev-only cache/HMR workarounds |
| `src/components/glass/` | Liquid Glass feature (untracked, per plans/wspolniak-glass.md): glass-lens, glass-refraction, glass-chrome/glass-surface, glass-provider, glass.css |
| `scripts/inject-sw-version.mjs` | Rewrites `__BUILD_ID__` in `dist/client/sw.js` post-build |

## 5. Commands

| Group | Commands |
|---|---|
| Dev | `pnpm dev` (port 3000), `pnpm types`, `pnpm lint`, `pnpm lint:fix`, `pnpm lint:ci`, `pnpm knip`, `pnpm deps` / `deps:update` / `deps:major` (taze) |
| Build/serve | `pnpm build`, `pnpm build:production` (sets `DEPLOY_ENV=production`), `pnpm serve` |
| Deploy | `pnpm deploy` (dev), `pnpm deploy:production` (→ wspolniak.com); dry-run check: `npx wrangler deploy --env='' --dry-run` must print name `wspolniak` |
| Test | `pnpm test`, `pnpm test:watch`, `pnpm test:coverage` |
| DB dev | `db:dev:generate` / `db:dev:migrate` / `db:dev:pull` / `db:dev:studio` / `db:dev:seed` (via `dotenvx run -f .dev.vars`, config `drizzle-dev.config.ts`) |
| DB prod | `db:production:generate` / `db:production:migrate` / `db:production:pull` (via `.production.vars`, `drizzle-production.config.ts`) |
| Admin/util | `admin:dev:regenerate`, `admin:production:regenerate` (magic link), `calendar:dev:trigger` (manual cron run — vite dev doesn't fire `scheduled`) |
| Typegen | `pnpm cf-typegen` (wrangler types → `worker-configuration.d.ts`) |
| Release | `pnpm release`, `pnpm release:dry` (semantic-release) |
| Quality gate | Always before finishing: `pnpm types && pnpm test && pnpm lint` |

## 6. Tests

- Framework: Vitest, `vitest.config.ts`; environment jsdom; `globals: true` — never import `describe/it/expect`.
- Location: colocated next to source as `*.test.ts` / `*.test.tsx` (~208 files under `src/`). `src/routes/**` excluded from discovery.
- Setup: `src/test/setup.ts`; alias `@` → `src/`; `cloudflare:workers` aliased to `src/test/cloudflare-workers-stub.ts` (DurableObject RPC stub).
- Convention: test at module boundaries (deep-modules rule); each API route module has a sibling `.test.ts`.
- CI runs `pnpm test` after lint + types.
- Root-level enforcement tests exist: `spdx-headers.test.ts`, `icons.test.ts`, `pwa-assets.test.ts`, `styles.test.ts`.

## 7. CI/CD

| File | What it does |
|---|---|
| `.github/workflows/release.yml` | On push to `main`: pnpm install → `lint:ci` → `types` → `test` → `npx semantic-release` (angular preset: feat→minor, fix/perf/refactor/revert→patch, breaking→major; updates CHANGELOG.md; commits as MrCrystal2) |
| `.releaserc.json` | Local semantic-release config mirroring the workflow |
| `.github/ISSUE_TEMPLATE/tdd-vertical-slice.md` | Issue template for TDD vertical-slice features |

## 8. Docs & plans

| File | One-liner |
|---|---|
| `README.md` | Product overview: audience, how it works, features, non-goals, stack table, roadmap |
| `CLAUDE.md` (root) | Main agent guide: commands, architecture, conventions, git workflow, upload-status notes; mandates reading INDEX.md first |
| `AGENTS.md` / `.claude/CLAUDE.md` | Template guide (tstack-on-cf): structure, commands, verification, test conventions |
| `CHANGELOG.md` | Auto-generated by semantic-release |
| `LICENSE` | AGPL-3.0-or-later |
| `src/docs/coverage-matrix.md` | Coverage matrix for docs content |
| `src/docs/content/bugs/*.md` (8) | Troubleshooting docs (big-photo, chat-messages-missing, magic-link-not-arriving, push-notifications-missing, slow-upload, stale-cache, youtube-problems, feature-turned-off) |
| `src/docs/content/product/*.md` (11) | Feature docs (albums, calendar, family-chat, feed, library, logging-in, notifications-and-pwa, reactions-comments, uploading-photos, videos, ai-assistant, for-admins) |
| `src/docs/content/technical/*.md` (14) | Internals docs (architecture, database-and-domains, deploy-and-migrations, photo-upload-pipeline, realtime-chat, push, pwa-offline, security-and-privacy, testing-strategy, video-pipeline, limits, stack, ai-internals, docs-under-the-hood) |
| `plans/chat-expansion.md` | Chat expansion: slash commands, attachments (R2, 1-day lifecycle), post sharing, polls; message `kind` discriminator + payload JSONB |
| `plans/wspolniak-glass.md` | Liquid Glass UI plan (issue #233): overlay token layer, glass-chrome/glass-surface recipes, default ON, localStorage pref |
| `plans/wspolniak-android-wrapper-prd.md` | Android wrapper PRD (share sheet, deep links) — draft, next step /carve |
| `plans/wspolniak-contact-email.md` | Decision record + HITL setup guide for contact@wspolniak.com (Cloudflare/Resend/Google) |
| `plans/* 2.md` (4 files) | macOS Finder duplicates of the above (identical sizes) |
| `crs-assets/wifi-spinner.md` | Source snippet for wifi spinner component |
| `.claude/rules/*.md` (15) | Scoped rules with `paths:` frontmatter: general, deep-modules, atomic-imports, error-handling, api/hono, api/cloudflare-workers, db/{drizzle,neon,zod}, frontend/{react,tanstack,ui,form-patterns,shadcn-tweakcn}, cloudflare-deployment |
| `.claude/agents/` | dd-i (implement design doc), dd-w (write design doc), mvp-e (MVP advisor) |
| `.claude/commands/` | `/implement` (dd-i on a doc), `/verify-dd` (review docs readiness) |

## 9. Secrets map — ⚠️ DO NOT READ

Detected by name/pattern + .gitignore only. Never open these files.

| Path | Type |
|---|---|
| `.env` | dotenv env file — gitignored; also denied to Claude via `.claude/settings.json` deny rule |
| `.dev.vars` | Wrangler local dev secrets (DB creds, SESSION_SECRET, VAPID, YOUTUBE_*, GROQ_API_KEY) |
| `.production.vars` | Wrangler production secrets — same shape |
| `.staging.vars` | Listed in .gitignore (file currently absent) |
| `sync-secrets.sh` | Shell script matching `*secret*` pattern — likely syncs .vars into Cloudflare |
| `android/gradle.properties` | Android build props — common keystore/password location (not inspected) |
| `.wrangler/` | Gitignored wrangler state/cache |
| `ai-demo/` | Gitignored local-only demo project ("never leaves this machine") |

Note: `.example.vars` is TRACKED and allowed — variable names are in §10.

## 10. Env variables (names only)

From tracked `.example.vars` + wrangler configs + `src/env.d.ts` + code usage:

| Name | Purpose |
|---|---|
| `CLOUDFLARE_ENV` | Marks vars file environment (dev) |
| `APP_URL` | Public base URL — critical for auth callback URLs (dev: `http://192.168.9.14:3000` / prod: `https://wspolniak.com`) |
| `DATABASE_HOST` / `DATABASE_USERNAME` / `DATABASE_PASSWORD` | Neon Postgres connection (drizzle configs + `initDatabase`) |
| `SESSION_SECRET` | Session cookie signing |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_IMAGES_API_TOKEN`, `CLOUDFLARE_IMAGES_ACCOUNT_HASH` | Cloudflare Images upload |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` / `YOUTUBE_TOKEN_ENCRYPTION_KEY` / `YOUTUBE_REDIRECT_URI` | YouTube OAuth + refresh-token encryption (optional; app detects "not configured") |
| `GROQ_API_KEY` | AI assistant (optional) |
| Bindings (not secrets) | `CHAT_ROOM` (Durable Object), `CHAT_ATTACHMENTS` (R2 bucket), crons `0 6 * * *` + `7 * * * *` |
| Build-time | `DEPLOY_ENV=production` selects `wrangler.prod.jsonc` in vite.config.ts |

## 11. Gotchas

1. **Two drizzle configs + two migration folders**: `drizzle-dev.config.ts` → `src/db/migrations/dev/` (36 files), `drizzle-production.config.ts` → `src/db/migrations/production/` (20). Both read creds from `.dev.vars`/`.production.vars` via dotenvx; both rewrite `sslmode=require` → `verify-full`. Never mix environments.
2. **Generated files are hard-blocked**: `routeTree.gen.ts` and `worker-configuration.d.ts` edits are rejected by a PreToolUse hook in `.claude/settings.json` (add/move route files instead; run `pnpm cf-typegen` after wrangler changes). Both are excluded from biome.
3. **500-line hard limit** per source file — split when exceeding.
4. **Deep modules (Ousterhout)**: small interface, large implementation; test at boundaries; avoid many shallow files.
5. **Atomic import edits**: PostToolUse hook runs `biome check --write --unsafe` on every edited file; hooks can auto-delete "unused" imports between sequential edits — always add import + usage in one edit. (Hook currently passes `--skip=correctness/noUnusedImports`, but treat the rule as active.)
6. **Biome Grit plugins ban patterns**: no raw `throw`, no `.then()` chains, no `@ts-ignore`, no `as any`, no TODO comments (`.biome-plugins/*.grit`). Formatting: tabs, width 100, double quotes. CSS lint/format disabled.
7. **Git workflow: no branches** — commit + push straight to `main`, no PRs, no approval questions. CI then runs semantic-release.
8. **Deploy trap**: `@cloudflare/vite-plugin` bakes ONLY the top-level wrangler config; `env:` blocks are ignored. Prod deploys must go through `pnpm build:production` (sets `DEPLOY_ENV=production` → `wrangler.prod.jsonc`) + `wrangler deploy --env=''`. Verify with `--dry-run` printing name `wspolniak`. Cloudflare rules: `custom_domain: true`, never the "HTTP→HTTPS redirect rule" template (301 loops), SSL mode Full.
9. **UPLOAD_TIMEOUT_MS = 7000** (`src/images/upload.ts`) applies to fast JSON requests only; file/video upload has deliberately NO hard timeout. Slow-link warning (`onSlowLink`, ~100 KB/s) shows once per file. Video = chunked upload with own progress. In-flight work (issue #199/#203): oversized-image pre-publish detection, crop/compress dialog, limit 15→19 MB (Cloudflare Images hard cap 20 MB).
10. **`crs-assets/` and `crs-assets 2/`**: vendored react-bits/CRS design assets; `crs-assets 2/` is a macOS Finder copy (files suffixed " 2") and is a subset — duplicate junk. Both dirs excluded from tsconfig and biome; tsconfig comment says BranchedMenu is already vendored into `src/components/docs/`, so `crs-assets/` can be deleted. `crs-assets/crack-button/` contains its own `node_modules`.
11. **`plans/* 2.md`** are also macOS duplicates (identical sizes) of the four real plans.
12. **`src/server.ts` fragility**: HMR workaround uses dynamic import of `@tanstack/react-start/server-entry` + `import.meta.hot.accept` invalidation (TanStack #7285). DO NOT DELETE. Related: vite dev disables the HMR overlay; `pnpm-workspace.yaml` hoists `@tanstack/*` to top-level because workerd doesn't follow pnpm symlinks (pnpm v11 reads these from `pnpm-workspace.yaml`, NOT `.npmrc`).
13. **Tests**: `cloudflare:workers` must be aliased to the stub in vitest; route files excluded; globals on.
14. **Docs contract**: `/docs` (src/docs/content) is the single source of truth for business requirements; never create separate md files for reviews/audits — apply notes directly into the corresponding design doc.
15. **AGPL SPDX header** (`// SPDX-License-Identifier: AGPL-3.0-or-later`) is expected on source files (enforced by `spdx-headers.test.ts`).
16. **Wrangler triggers**: two crons — daily 06:00 UTC calendar job, hourly `7 * * * *` chat expiry (`src/scheduled.ts` branches on `controller.cron`). `pnpm dev` never fires `scheduled`; use `pnpm calendar:dev:trigger`.
