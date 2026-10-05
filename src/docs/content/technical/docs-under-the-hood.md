---
title: Dokumentacja pod maską
---

Docsy Wspólniaka to zwykłe pliki Markdown w repozytorium. Nie ma panelu do edycji, bazy ani CMS-a — treść żyje w `src/docs/content/{dział}/{slug}.md`, a cała „magia" to cztery małe moduły.

## Treść i registry

Każdy plik `.md` w `src/docs/content/` trafia do builda automatycznie (Vite glob import — Workers nie mają filesystemu, więc treść jest „wypiekana" w bundlu). Jedynym dostępem do treści jest **registry** (`src/docs/registry.ts`) z trzema funkcjami:

| Funkcja | Co robi |
| --- | --- |
| `getDoc(dział, slug)` | zwraca dokument `{ dział, slug, tytuł, treść }` albo `null` |
| `listDocs(dział)` | wszystkie dokumenty działu |
| `searchDocs(zapytanie)` | wyszukiwanie po tytułach i treści |

Tytuł pochodzi z frontmattera (`title:` na początku pliku), treść to reszta. Slug to nazwa pliku — po angielsku, treść po polsku.

## Wyszukiwanie i AL

`searchDocs` punktuje dopasowania: **+10 za trafienie w tytule, +1 w treści**, z ignorowaniem polskich znaków („zdjęć" i „zdjec" trafiają identycznie). AL korzysta z tego przed każdą rozmową: wyszukuje fragmenty i dokleja je do swojego promptu razem z linkami do artykułów (produkcyjnie `https://docs.wspolniak.com/...`).

## Serwowanie po hoście

`src/docs/host.ts` decyduje, co renderuje dany adres:

- dowolny host `docs.*` (np. `docs.wspolniak.com`) → docsy
- localhost renderuje ścieżki docsów bezpośrednio
- inny host z docsową ścieżką → przekierowanie 301 na subdomenę

Stare adresy też żyją: `/docs` → strona główna docsów, `/docs/big-photo` → `/bugs/big-photo`, reszta `/docs/*` → odpowiednik na subdomenie (301).

## Podświetlanie kodu

Bloki kodu koloruje **Shiki**, ładowany leniwie w przeglądarce (tylko gdy artykuł ma kod). Przed hydratacją kod wygląda jak zwykły `<pre>` — to zamierzone.

## Strażnicy treści

Dwa automatyczne testy pilnują jakości treści przy każdym buildzie:

- **zero-secrets** — skanuje wszystkie artykuły w poszukiwaniu kształtów kluczy API i haseł; artykuł z sekretem wywala testy
- **macierz pokrycia** (`src/docs/coverage-matrix.md`) — każda funkcja apki musi mieć dokument w dziale produktowym, test weryfikuje, że każda referencja istnieje w registry

> **Uwaga:** nowy artykuł = nowy plik `.md` + wpis w manifeście sidebara (`src/docs/manifest.ts`). Reszta (registry, wyszukiwanie, AL, strażnicy) podbiera go automatycznie.
