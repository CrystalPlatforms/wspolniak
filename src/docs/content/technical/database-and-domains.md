---
title: Baza danych i domeny
---

Wspólniak trzyma wszystko w jednej bazie **Neon PostgreSQL** (serverless — skala do zera, płacisz za użycie). Do bazy mówi się przez **Drizzle ORM**, a kod bazy jest pocięty na małe domeny z jednym zadaniem.

## Struktura domeny

Każda domena w `src/db/{nazwa}/` eksportuje ten sam zestaw: tabelę Drizzle, typy TypeScript, schemat walidacji Zod i funkcje zapytań:

```
src/db/posts/
├── table.ts        # definicja tabeli Drizzle
├── schema.ts       # walidacja Zod
├── queries.ts      # wszystkie zapytania dla tej domeny
└── index.ts        # publiczne API domeny
```

To podejście **deep modules**: mały interfejs (eksportowane funkcje), duża implementacja w środku. Endpoint API woła funkcje z domen, nie pisząc SQL-a ręcznie. W repo żyje kilkanaście domen: `posts`, `comments`, `chat`, `calendar`, `albums`, `bookmarks` (biblioteka), `mentions`, `pinned-posts`, `post-reactions`, `video-uploads`, `push-subscriptions`, `push-delivery-events`, `identity`, `instance`, `health`, `stats` — każda z własnymi zapytaniami.

## Dwa środowiska

Dev i production mają **osobne bazy** Neon i osobne migracje:

```bash
pnpm db:dev:generate      # generuje migracje z schemy
pnpm db:dev:migrate       # aplikuje na dev bazę
pnpm db:production:migrate  # ręcznie, przed deployem produkcyjnym
```

> **Uwaga:** dev i production biegą na osobnych bazach Neon — incident na devie nie dotyka produkcji. Przed deployem produkcyjnym najpierw migracja, potem deploy (stary worker nie dostałby nowej schemy).
