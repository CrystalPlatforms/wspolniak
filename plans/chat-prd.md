# PRD: Wspólniak Chat

## Overview

Wspólniak Chat to globalny czat rodzinny w czasie rzeczywistym, dostępny dla wszystkich członków rodziny w aplikacji Wspólniak. Rozwiązuje problem rozproszenia komunikacji po wielu zewnętrznych komunikatorach przez dostarczenie szybkiego, efemerycznego kanału kontaktu w miejscu, gdzie jest już cała rodzina.

---

## Problem Statement

Rodzina komunikuje się przez różne komunikatory (np. WhatsApp), ale nie wszyscy są tam obecni. Wspólniak jest jedynym miejscem, gdzie są wszyscy członkowie rodziny — jednak brakuje w nim szybkiego kanału do bieżącej komunikacji. Posty na feedzie nie nadają się do tego celu — są trwałe i mają inną intencję.

---

## Users

| User type       | Opis                                                                    | Szacunkowa liczba             |
| --------------- | ----------------------------------------------------------------------- | ----------------------------- |
| Członek rodziny | Każdy zalogowany użytkownik Wspólniaka, mixed tech skills, mobile-first | Wszyscy użytkownicy aplikacji |

---

## Goals & Success Criteria

- [ ] Rodzina używa chatu Wspólniaka zamiast WhatsApp / innych komunikatorów do bieżącego kontaktu
- [ ] Wiadomości są dostarczane i widoczne w czasie rzeczywistym bez ręcznego odświeżania
- [ ] Doświadczenie użytkownika jest płynne i dopracowane — punkt odniesienia: Telegram na iOS

---

## User Stories

1. Jako członek rodziny chcę wysłać wiadomość tekstową do całej rodziny, żeby szybko się skontaktować.
2. Jako członek rodziny chcę zareagować na wiadomość emoji, żeby wyrazić reakcję bez pisania odpowiedzi.
3. Jako członek rodziny chcę odpowiedzieć (reply) na konkretną wiadomość, żeby kontekst rozmowy był czytelny.
4. Jako członek rodziny chcę widzieć że ktoś pisze w tej chwili, żeby wiedzieć że mam poczekać na odpowiedź.
5. Jako członek rodziny chcę dostać push notyfikację o nowej wiadomości, żeby nie przegapić kontaktu.
6. Jako członek rodziny chcę otworzyć chat z dowolnego miejsca w aplikacji, żeby nie przerywać tego co robię.

---

## Scope

### In scope

- Jeden globalny czat dla całej rodziny
- Wiadomości tekstowe
- Reakcje emoji (ten sam predefiniowany zestaw co w feedzie)
- Reply — odpowiedź z cytowaniem konkretnej wiadomości
- Wygasanie wiadomości po 24h od wysłania (rolling, per wiadomość, twarda zasada)
- Real-time delivery (bez odświeżania strony)
- Typing indicator ("ktoś pisze...")
- Push notyfikacje o nowych wiadomościach (podpięcie pod istniejący system Web Push VAPID)
- Ładowanie wszystkich wiadomości z ostatnich 24h przy otwarciu chatu; loader + informacja gdy jest ich dużo
- Podstrona `/chat` (TanStack Router)
- **Mobile:** slide-out drawer z lewej (jak X/Twitter) jako główna nawigacja z hamburgerem w lewym górnym rogu ekranu + nagłówek "Witamy!"
- **Desktop:** Chat jako nowa pozycja w istniejącym sidebarze
- Animacje UI (patrz sekcja UX & Animacje)

### Out of scope

- Czaty 1 na 1 (prywatne)
- Czaty grupowe (podgrupy)
- Wysyłanie zdjęć / mediów
- Edycja wysłanej wiadomości
- Usuwanie wiadomości przez użytkownika
- Moderacja admina w chacie
- Read receipts ("przeczytane przez")
- Badge / counter nieprzeczytanych na ikonie chatu
- Przypinanie wiadomości
- Wyszukiwanie w historii chatu

---

## UX & Animacje

Punkt odniesienia: **Telegram na iOS**. Wszystkie animacje muszą być płynne, natywnie odczuwalne i nie mogą zacinać się na urządzeniach mobilnych.

### Wysyłanie wiadomości (Optimistic UI)

1. Użytkownik klika "wyślij"
2. Bąbelek wiadomości **pojawia się natychmiast** w liście (optimistic insert) — bez czekania na odpowiedź serwera
3. Pod bąbelkiem pojawia się **cienki pasek postępu** (progress bar) animowany do momentu potwierdzenia z API
4. Po potwierdzeniu: pasek znika, wiadomość zostaje — bez żadnego "skoku" layoutu
5. W przypadku błędu: pasek zmienia kolor na czerwony + opcja ponowienia

### Nowe wiadomości przychodzące

- Każda nowa wiadomość **wślizguje się z dołu** — animacja translate + fade, jak w Telegram
- Czas animacji: ~220ms, easing: `ease-out`
- Lista automatycznie scrolluje się do dołu jeśli użytkownik jest blisko końca (ostatnie ~100px); jeśli scrollował wyżej — nie przewija automatycznie, pojawia się przycisk "↓ nowe wiadomości"

### Reakcje

- Po kliknięciu emoji — animacja **pop/bounce** (scale: 0 → 1.3 → 1.0, ~200ms)
- Reakcje wyświetlane jako same emoji pod bąbelkiem — **bez liczników**
- Każdy użytkownik widzi swoje emoji podświetlone (np. lekko jaśniejsze tło lub border)
- Usunięcie reakcji: kliknięcie ponownie tego samego emoji — animacja fade out

### Drawer nawigacyjny (mobile)

- Otwieranie: **slide-in z lewej**, ~250ms, easing: `ease-out`
- Zamykanie: slide-out w lewo lub swipe w lewo
- Tło (overlay): fade in/out, `backdrop-blur` lub ciemne przyciemnienie

### Typing indicator

- Animacja trzech kropek ("...") pulsujących naprzemiennie — jak w Telegram / iMessage
- Pojawia się i znika z animacją fade

### Ogólne zasady

- Animacje oparte na **CSS transitions / Tailwind** (`tw-animate-css` jest w zależnościach) lub `framer-motion` jeśli jest potrzeba bardziej złożonych sekwencji
- Żadna animacja nie może blokować interakcji (wszystko `pointer-events: auto` podczas animacji)
- Preferowane `transform` i `opacity` — nie animować `height`, `width`, `top`, `left` (wydajność GPU)

---

## System Components

### Stack kontekst

| Warstwa     | Technologia                                              |
| ----------- | -------------------------------------------------------- |
| Framework   | TanStack Start (SSR + Router + Query)                    |
| API         | Hono na Cloudflare Workers                               |
| Baza danych | Neon PostgreSQL (serverless, `@neondatabase/serverless`) |
| ORM         | Drizzle ORM                                              |
| Push        | Web Push VAPID (istniejący system)                       |
| Styling     | Tailwind CSS v4 + shadcn/ui + tw-animate-css             |
| Build       | Vite + pnpm                                              |
| Linting     | Biome                                                    |

### Schemat bazy danych (Neon PostgreSQL + Drizzle)

**Tabela `chat_messages`:**

```
id           uuid         PK, default gen_random_uuid()
author_id    uuid         FK → users.id
text         text         NOT NULL
reply_to_id  uuid         FK → chat_messages.id (nullable)
reply_text   text         snapshot cytowanej wiadomości (nullable)
created_at   timestamptz  default now()
expires_at   timestamptz  default now() + interval '24 hours'
```

**Tabela `chat_reactions`:**

```
id           uuid         PK
message_id   uuid         FK → chat_messages.id ON DELETE CASCADE
user_id      uuid         FK → users.id
emoji        text         NOT NULL
created_at   timestamptz  default now()
UNIQUE (message_id, user_id, emoji)
```

### API (Hono)

```
GET  /api/chat/messages                — pobierz wiadomości z ostatnich 24h
POST /api/chat/messages                — wyślij nową wiadomość
POST /api/chat/messages/:id/reactions  — dodaj / usuń reakcję
GET  /api/chat/ws                      — WebSocket endpoint (Durable Object)
```

### Real-time (Cloudflare Durable Objects + WebSocket)

Wiadomości dostarczane bez odświeżania strony przez **Cloudflare Durable Objects**.

Architektura:

- Jeden DO (`ChatRoom`) trzyma aktywne WebSocket connections wszystkich podłączonych klientów
- Klient łączy się przez `GET /api/chat/ws` → Worker przekierowuje do DO
- DO rozsyła wiadomości do wszystkich połączonych klientów (broadcast)
- DO wymaga dodania do `wrangler.jsonc`:
  ```jsonc
  [[durable_objects.bindings]]
  name = "CHAT_ROOM"
  class_name = "ChatRoom"
  ```

Typing indicator: klient wysyła zdarzenie `{ type: "typing" }` przez WebSocket → DO broadcastuje do pozostałych. Wygasa automatycznie po ~3s braku aktywności klienta.

### Nawigacja

**Mobile:**

- Hamburger (lewy górny róg) → slide-out drawer z lewej
- Drawer zawiera wszystkie sekcje: Home, Chat, Kalendarz, Albumy, Profil itd.
- Nagłówek główny ekranu: "Witamy!"
- Animacja drawera: slide-in z lewej, ~250ms ease-out (patrz UX & Animacje)

**Desktop:**

- Istniejący sidebar (TanStack Router layout) — dodać pozycję "Chat"

### Wygasanie wiadomości

Brak natywnych Cron Triggers w obecnym `wrangler.jsonc`. Opcje:

1. **Dodać Cron Trigger do wrangler.jsonc** — Worker odpala się co godzinę i usuwa z Neon rekordy gdzie `expires_at < now()`
2. **Lazy delete** — przy każdym `GET /api/chat/messages` usuwaj wygasłe wiadomości przed zwróceniem wyniku

Rekomendacja: Cron Trigger (opcja 1) — nie obciąża ścieżki odczytu.

### Push notyfikacje

Podpiąć pod istniejący system Web Push VAPID — wysyłać przy nowej wiadomości na chacie (nie przy reakcjach, nie przy typing indicator).

---

## Implementation Decisions

| Decyzja                   | Wybór                                  | Uzasadnienie                                                                                                          |
| ------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Zakres chatu              | Jeden globalny                         | Prostota; rodzina jest jedną jednostką                                                                                |
| Trwałość wiadomości       | 24h rolling, per wiadomość             | Efemeryczność odróżnia chat od feedu; brak wyjątków upraszcza logikę                                                  |
| Reakcje                   | Ten sam zestaw co feed, bez liczników  | Spójność UX; czytelniejszy wygląd                                                                                     |
| Wysyłanie                 | Optimistic UI + pasek postępu          | Natychmiastowe odczucie; pasek informuje o stanie wysyłki                                                             |
| Animacja nowej wiadomości | Slide-in z dołu jak Telegram           | Naturalny ruch zgodny z oczekiwaniami użytkownika                                                                     |
| Animacja reakcji          | Pop/bounce przy kliknięciu             | Satysfakcjonujące, natywne odczucie                                                                                   |
| Edycja / usuwanie         | Nie                                    | Prostota; wiadomości i tak znikają po 24h                                                                             |
| Read receipts             | Nie                                    | Redukuje presję społeczną; prostota implementacji                                                                     |
| Badge nieprzeczytanych    | Nie                                    | Redukuje anxiety; chat jest efemeryczny z natury                                                                      |
| Wygasanie                 | Cron Trigger (rekomendacja)            | Nie blokuje ścieżki odczytu                                                                                           |
| Real-time transport       | Cloudflare Durable Objects + WebSocket | Natywne narzędzie CF do persistent connections; DO rozsyła do wszystkich klientów; jedyna opcja bez timeoutów Workers |
| Jakość animacji           | Telegram na iOS                        | Punkt odniesienia dla płynności i dopracowania                                                                        |

---

## Validation Strategy

Wdrożenie do produkcji → obserwacja czy rodzina faktycznie przechodzi z WhatsApp na chat Wspólniaka.

---

## Open Questions

- [ ] **Definicja "dużo wiadomości":** Jaki próg uruchamia loader + komunikat przy ładowaniu historii? (np. > 50, > 100 wiadomości?)

---

## References

- Discovery summary: sesja /ask (ta rozmowa)
- PRD główny Wspólniak: `./docs/002-prd.md` (repozytorium)
- Repo: `github.com/CrystalGamesStudio/wspolniak`
- Styl nawigacji mobile: X/Twitter (slide-out drawer)
- Punkt odniesienia UX: Telegram na iOS
