---
title: Architektura i warstwy
---

Wspólniak dzieli kod na cztery wyraźne warstwy. Każda ma jedno zadanie i mówi z sąsiednią przez mały, zamknięty interfejs.

## Routing hybrydowy

`src/server.ts` — entry Workera — kieruje żądania:

```ts
if (url.pathname.startsWith("/api/")) {
	return apiHono.fetch(request, env, ctx);
}
```

- `/api/*` → **Hono API** — auth middleware doklejany per endpoint, middleware admina dla strefy admina, walidacja Zod per-handler, rate limiting tam, gdzie trzeba (np. logowanie kodem dostępu)
- `/app/u/*` → auth middleware (magic links)
- reszta → **TanStack Start SSR** (routing plikowy w `src/routes/`)

## Domeny bazy danych

Każda domena (`posts`, `comments`, `push-subscriptions`, …) w `src/db/{domain}/` eksportuje: tabelę Drizzle, typy (`User`, `NewUser`), schemat Zod i funkcje zapytań. To **deep modules** — mały interfejs, duża implementacja.

## Frontend routing

Trasy w `src/routes/` — plikowy routing TanStack:

- `src/routes/__root.tsx` — główny layout, ThemeProvider
- `src/routes/app/*` — trasy aplikacji za authem
- docsy: `/product/$slug`, `/technical/$slug`, `/bugs/$slug` i `/credits`
- Trasy generowane automatycznie do `routeTree.gen.ts` — nigdy nie edytować ręcznie.

## PWA i push

- `src/pwa/` — service worker, install prompt, status online
- Push przez **Web Push VAPID**, cache offline ostatniego feedu.

> **Uwaga:** działy docsów są serwowane przez ten sam Worker co aplikacja — rozdzielone tylko po Host header (`docs.*`).
