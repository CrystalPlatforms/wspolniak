---
title: Testowanie i jakość
---

Wspólniak testuje się na granicach modułów — nie rozdrabnia testów na wewnętrzne detale. Założenie: test powinien opisywać **zachowanie**, nie implementację, żeby refaktor kodu nie wywalał testów.

## Konwencje

- Testy żyją **obok kodu** (`foo.test.ts` obok `foo.ts`), w Vitest z globalami — bez importów `describe`/`it`/`expect`.
- Ścieżka `@/` rozwiązuje się do `src/`.
- Trasy (`src/routes/**`) są wykluczone z test discovery — komponenty tras sprawdzane są HITL (ręcznie) po deployu.
- Mockujemy tylko na granicach systemu: baza, czas, losowość, sieciówka. Własnych modułów nie mockujemy — jeśli czujemy taką potrzebę, moduł powinien zostać podzielony.

## Sprzęt testowy

W `src/test/` siedzi pomocniczy sprzęt:

| Plik | Do czego |
| --- | --- |
| `setup.ts` | globalny setup jsdom: stuby `scrollIntoView`, `scrollTo`, `ResizeObserver` (jsdom nie ma layoutu) |
| `fake-xhr.ts` | **FakeXHR** — kontrolowane testy uploadu zdjęć (progres, timeouty, błędy sieci) bez prawdziwej sieci |
| `cloudflare-workers-stub.ts` | stub `cloudflare:workers` — DurableObject istnieje tylko w workerd, w Vitest podstawiamy atrapę |

## Quality gates

Przed każdym shipem trzy komendy muszą być zielone:

```bash
pnpm types   # tsc --noEmit — bez błędów typów
pnpm test    # Vitest — pełny pakiet
pnpm lint    # Biome — styl i błędy
```

> **Uwaga:** testy nie pokrywają tras — pełny obraz daje dopiero ręczne przejście aplikacji po deployu (HITL).
