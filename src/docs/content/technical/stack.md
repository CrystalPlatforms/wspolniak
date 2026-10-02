---
title: Stack technologiczny
---

Wspólniak działa na **Cloudflare Workers** — bez własnego serwera, bez miesięcznych opłat. Poniżej pełna lista technologii, na których stoi aplikacja.

## Frontend

- **TanStack Start** — framework full-stack (SSR + Router + Query) na React 19. Routing plikowy, server functions, hydratacja.
- **Tailwind CSS v4** + **Shadcn/UI** — komponenty stylowane zmiennymi motywu (jasny/ciemny).
- **PWA** — service worker, instalacja na telefonie, offline cache feedu.

## Backend

- **Hono** — framework API na Workers. Entry Workera (`src/server.ts`) kieruje `/api/*` do Hono, resztę do SSR TanStack Start.
- **Neon PostgreSQL** + **Drizzle ORM** — serverless baza (magic-link sesje, posty, komentarze, czat).
- **Cloudflare Images** — zdjęcia z automatyczną konwersją HEIC i wariantami rozmiarów.

## Jakość

- **TypeScript strict** w całym repo, **Biome** jako linter, **Vitest + Testing Library** do testów.
- Package manager: **pnpm**.

```ts
// Kształt modułu domenowego (src/db/{domain}/)
export interface Doc {
	department: "product" | "technical" | "bugs";
	slug: string;
	title: string;
	content: string;
}
```

> **Uwaga:** pełna dokumentacja architektury jest w pliku `CLAUDE.md` w repozytorium projektu.
