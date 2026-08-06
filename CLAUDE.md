# CLAUDE.md

Ten plik dostarcza wskazówek Claude Code (claude.ai/code) przy pracy z kodem w tym repozytorium.

## O projekcie

**Wspólniak** to prywatny rodzinny serwis do dzielenia się zdjęciami — self-hostowany na Cloudflare. Jedna rodzina = jedna instancja = jeden admin. Bez haseł, z magic links, PWA i push notifications.

Stack technologiczny:
- **Frontend**: TanStack Start (SSR + Router + Query) + React 19
- **Backend**: Hono na Cloudflare Workers  
- **Baza danych**: Neon PostgreSQL + Drizzle ORM (serverless)
- **Storage**: Cloudflare Images (automatyczna konwersja HEIC → warianty)
- **Styling**: Tailwind CSS v4 + Shadcn/UI
- **Język**: TypeScript strict, polskie UI
- **Testing**: Vitest + Testing Library
- **Package manager**: pnpm

## Komendy

### Development
```bash
pnpm dev                  # dev server (port 3000)
pnpm types                # type-check (tsc --noEmit)
pnpm test                 # run all tests
pnpm test:watch           # watch mode
pnpm lint                 # biome check
pnpm lint:fix             # biome auto-fix
```

### Build & Deploy
```bash
pnpm build                # production build (dev environment)
pnpm build:production     # production build (production environment)
pnpm deploy               # build + wrangler deploy (dev)
pnpm deploy:production    # build + deploy to production
```

### Database (środowisko-specific)
```bash
# Dev
pnpm db:dev:generate      # generate dev migrations
pnpm db:dev:migrate       # run dev migrations
pnpm db:dev:pull          # pull schema from dev DB
pnpm db:dev:studio        # Drizzle Studio (dev)
pnpm db:dev:seed          # seed dev DB

# Production
pnpm db:production:generate   # generate production migrations
pnpm db:production:migrate    # run production migrations
pnpm db:production:pull       # pull schema from production DB
```

### Admin utilities
```bash
pnpm admin:dev:regenerate         # regenerate admin magic link (dev)
pnpm admin:production:regenerate  # regenerate admin magic link (prod)
```

## Architektura High-Level

### Hybrydowy routing (CF Workers Entry)

`src/server.ts` to custom entry point dla Cloudflare Workers:
- `/api/*` → Hono API backend
- `/app/u/*` → Hono auth middleware  
- Reszta → TanStack Start SSR frontend

Każdy request inicjalizuje singleton DB connection przez `initDatabase(env)`.

### Domain-based architecture

```
src/db/{domain}/
├── table.ts        # Drizzle schema (pgTable)
├── schema.ts       # Zod validation schemas
├── queries.ts      # All DB operations for this domain
└── index.ts        # Public API exports
```

Przykłady domen: `posts`, `comments`, `post-reactions`, `identity`, `instance`, `push-subscriptions`.

Każda domena eksportuje:
- Tabelę Drizzle (np. `users`)
- Typy: `User` (select), `NewUser` (insert)
- Zod schema: `userSchema` dla walidacji
- Query functions: `getUserById()`, `createUser()` itp.

### Frontend routing (TanStack Start)

- `src/routes/__root.tsx` — główny layout
- `src/routes/app/*` — trasy aplikacji (feed, posty, admin)
- `src/routes/auth/*` — setup i landing
- File-based routing: `post.$id.tsx` → dynamiczny segment
- Auto-generated `routeTree.gen.ts` — NIGDY nie edytować ręcznie

### API layer (Hono)

- `src/hono/api/` — endpointy Hono
- `src/hono/factory.ts` — typed Hono with Env bindings
- Middleware chain: requestId → errorHandler → cors → auth → rateLimiter → validator
- Handlers call query functions from `@/db/{domain}` (thin wrappers)

### PWA & Push

- `src/pwa/` — service worker, install prompt, online status
- Push notifications via Web Push VAPID
- Offline cache dla ostatnio załadowanego feedu

## Environment-specific configs

### Dwie konfiguracje Drizzle

- `drizzle-dev.config.ts` — development (`.dev.vars`)
- `drizzle-production.config.ts` — production (`.production.vars`)

Każdy ma własny folder migrations:
- `src/db/migrations/dev/` — dev migrations
- `src/db/migrations/production/` — production migrations

### Dwa environmenty w Cloudflare

`wrangler.jsonc` definiuje dwa environmenty:
- Domyślne (dev) — `wspolniak-dev`, lokalne developowanie
- `production` — `wspolniak.com`, produkcja

Deploy:
- `pnpm deploy` → dev environment
- `pnpm deploy:production` → production environment

### Sekrety i env vars

- `.dev.vars` (gitignored) — local dev secrets
- `.production.vars` (gitignored) — production secrets
- Cloudflare dashboard — remote secrets (production)
- `APP_URL` — critical dla auth callback URLs

## Quality gates (przed PR)

Zawsze uruchom przed zakończeniem pracy:
```bash
pnpm types && pnpm test && pnpm lint
```

## Ważne konwencje

### Deep modules (Ousterhout)

Preferuj głębokie moduły (mały interface, duża implementacja):
- Eksportuj tylko to, co caller potrzebuje
- Testuj na granicach modułów, nie internów
- Unikaj shallow modules (wiele małych plików robiących mało)

### Error handling

- `AppError` z `@/core/errors` dla znanych błędów
- `Result<T>` dla recoverable errors
- `isUniqueViolation()` dla constraint conflicts
- Nie łap unexpected errors — niech propagate do global handler

### Testing

- Testy obok source: `*.test.ts` / `*.test.tsx`
- Vitest z globals — nie importuj `describe`/`it`/`expect`
- Path alias `@/` resolves to `src/`
- Route files (`src/routes/**`) excluded z test discovery

### Atomic imports

PostToolUse hooks (biome, eslint) mogą auto-deletować "unused" imports między edytami. Zawsze łącz dodanie importu z jego użyciem w jednym Edit call.

### Maksymalna wielkość pliku

Max 500 linii per source file — split gdy exceeding.

## Dokumentacja biznesowa

- `/docs` — single source of truth dla business requirements
- `plans/` — PRD i plany fazowania dla przyszłych funkcji
- Apply review notes/status updates directly w corresponding design doc

## Git workflow

Bez branchy — commit + push bezpośrednio na main. Bez PR, pytań o approval.

## Statusy projektów w toku

Zobacz lokalną pamięć projektu Claude Code (`MEMORY.md`) dla aktualnych statusów migracji i implementacji.

Pamięć jest lokalna dla każdego dewelopera — jej ścieżka wynika ze ścieżki repo na danej
maszynie, więc nie wpisuj tu ścieżek bezwzględnych. Statusy istotne dla obu deweloperów
trzymaj w `/docs` lub `plans/`.

## Reguły specyficzne dla technologii

Szczegółowe reguły w `.claude/rules/` z scoped `paths:` frontmatter:
- TanStack Start/Router/Query patterns
- Cloudflare Workers deployment  
- Hono framework
- Drizzle ORM
- Zod validation
- Error handling
- TypeScript best practices
- Testing patterns
- Deployment rules

Reguły aktywują się automatycznie gdy dotykasz odpowiednich plików.