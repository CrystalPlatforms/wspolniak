# Wspólniak

**Prywatny rodzinny serwis do dzielenia się zdjęciami — self-hostowany na Cloudflare.**

Wspólniak to prosta, otwarta alternatywa dla Facebooka, Google Photos i iCloud Shared Albums — zaprojektowana dla jednej rodziny, jednej instancji i jednego admina. Bez haseł, bez reklam, bez śledzenia. Babcia dostaje link, klika, instaluje PWA na telefonie i już jest w środku.

> **Status:** aplikacja w aktywnej produkcji. Feed, posty, komentarze, reakcje i panel admina są wdrożone i używane. Kolejne funkcje (albumy, kalendarz, wideo, threaded replies, @mentions, tryb awaryjny) mają gotowe PRD i czekają na fazowanie (`/carve`) — zobacz sekcję [Roadmapa](#roadmapa) oraz [`docs/002-prd.md`](docs/002-prd.md).

---

## About

### Dla kogo

Dla rodzin, które chcą prywatnej przestrzeni na zdjęcia i wspomnienia, bez:

- **Rejestracji i haseł** — starsze osoby w rodzinie (babcia, dziadek) nie radzą sobie z logowaniem, captchami i weryfikacją email. Każda bariera = nieużywany serwis.
- **Algorytmicznego feedu** — chcesz widzieć zdjęcia chronologicznie, nie wg tego co AI uzna za "angażujące".
- **Reklam i trackingu** — zdjęcia rodzinne nie powinny karmić cudzych modeli ML.
- **Centralnego dostawcy** — jedna rodzina = jedna instancja = osobne dane. Zero shared infrastructure.

### Jak to działa

1. **Admin** (głowa rodziny) wdraża swoją instancję Wspólniaka jednym kliknięciem "Deploy to Cloudflare".
2. Admin tworzy konta dla członków rodziny i dostaje dla każdego unikalny **magic link**.
3. Admin dystrybuuje linki poza systemem — SMS, WhatsApp, email.
4. Członek rodziny klika link → zostaje zalogowany na zawsze (long-lived cookie).
5. Członek instaluje PWA na telefonie ("Dodaj do ekranu głównego"), robi zdjęcie, wrzuca.
6. Reszta rodziny dostaje natychmiastowe **push notification** i widzi zdjęcie w chronologicznym feedzie.

### Funkcjonalności (produkcja)

- Chronologiczny feed z infinite scroll
- Posty z opisem i zdjęciami (JPEG, PNG, WebP, **HEIC z iPhone'a** — automatyczna konwersja)
- Komentarze pod postami
- Reakcje (zestaw emoji na postach i komentarzach)
- Push notifications (Android, iOS 16.4+, desktop)
- PWA — instalowalna na ekranie głównym telefonu
- Offline reading ostatnio załadowanego feedu
- Panel admina
- Jeden admin per instancja, dowolna liczba członków

### Czego **nie** ma i nie będzie

- Multi-tenancy (jeden Worker = jedna rodzina)
- Publicznych profili
- Algorytmicznego rankingu
- Reklam
- Hostowanej wersji SaaS
- Natywnych menu w stylu OS (odrzucone — nieosiągalne w web PWA)

### Stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start (SSR + Router + Query) |
| Styling | Tailwind CSS v4 + Shadcn/UI |
| API | Hono na Cloudflare Workers |
| Database | Neon PostgreSQL (serverless) + Drizzle ORM |
| Image storage | Cloudflare Images (automatyczna konwersja HEIC, warianty) |
| Push | Web Push VAPID |
| Tooling | Vite, pnpm, Biome |
| Language | TypeScript strict, Polish UI |
| License | AGPL-3.0-or-later |

---

## Roadmapa

Poniższe funkcje mają zakończoną fazę PRD i czekają na fazowanie implementacji (`/carve`). Pliki PRD znajdują się w `./plans/`.

### Albumy
- Trwałe (nie wygasają), edytowalne przez każdego użytkownika
- Zdjęcia w albumie wymagają tytułu lub krótkiego opisu
- Album suggestion — system proponuje utworzenie albumu na podstawie wybranych postów (np. "Wakacje 2025")
- Pobieranie zdjęć z albumu jako ZIP

### Aktualizacje istniejących funkcji — [`plans/wspolniak-updates-prd.md`](plans/wspolniak-updates-prd.md)
- **Wydajność** — SSR loader + `beforeLoad` auth, Suspense streaming, optimistic UI, indeksy Neon + cursor pagination
- **Threaded replies** — max 5 odpowiedzi na komentarz, jeden poziom zagnieżdżenia
- **@mentions** — zielony dropdown, powiadomienia push przez istniejący Web Push VAPID
- **Tryb awaryjny (maintenance mode)** — przełącznik admina w Neon `system_settings`, pełnoekranowy czarny overlay w `beforeLoad`
- **Bottom bar** — usunięcie przycisku Feedback, dodanie Home → feed

### Kalendarz — [`plans/wspolniak-kalendarz-prd.md`](plans/wspolniak-kalendarz-prd.md)
- Wydarzenia rodzinne z cyklicznością (jednorazowe / tygodniowe / miesięczne / roczne, dzień+miesiąc bez roku dla cyklicznych)
- Wszyscy członkowie rodziny mogą dodawać wydarzenia; edycja/usuwanie tylko przez autora lub admina
- Przypomnienia jako post systemowego użytkownika "Kalendarz" na Feedzie, 7 dni przed każdą datą
- Polskie święta ustawowe i kościelne (w tym ruchome, np. Wielkanoc) z zewnętrznego API/biblioteki — przypomnienia o świętach wyłączone domyślnie, admin może włączyć
- Widok: chronologiczna lista nadchodzących wydarzeń (mobile), lista + siatka miesięczna (desktop)
- Brak komentarzy pod wydarzeniami; wszystkie wydarzenia widoczne dla całej rodziny
- Wersja v1 w PRD: tylko admin dodaje wydarzenia w panelu, Cron Worker codziennie o 08:00 wystawia posty na Feedzie (D-7 i D-0), bez osobnej zakładki `/calendar` — pełna wersja opisana wyżej to kolejny etap
- Otwarte pytanie: która biblioteka polskich świąt

### Wspólniak Video — [`plans/wspolniak-video-prd.md`](plans/wspolniak-video-prd.md)
- Nowa zakładka `/video` do uploadu filmów rodzinnych
- Upload bezpośrednio z przeglądarki do YouTube Resumable Upload API (Worker dostarcza tylko token OAuth) — wymuszone limitem 100 MB body na Cloudflare Workers
- Dedykowane konto YouTube, filmy "unlisted"
- Limit 3 uploadów/dzień (limit YouTube Data API), maks. 2 GB na plik

---

## Dla członków rodziny

Dostałeś link od kogoś z rodziny? Oto jak zacząć:

### 1. Otwórz link

Kliknij link, który dostałeś (np. przez SMS lub WhatsApp). Zostaniesz automatycznie zalogowany — bez hasła, bez rejestracji.

### 2. Zainstaluj aplikację na telefonie

Wspólniak działa jako PWA (Progressive Web App) — możesz "zainstalować" go jak normalną aplikację, bez App Store.

**Android (Chrome):**
1. Pojawi się baner **"Zainstaluj aplikację Wspólniak"** na dole ekranu
2. Kliknij **Instaluj**
3. Gotowe — ikona pojawi się na ekranie głównym

**iPhone (Safari):**
1. Pojawi się baner z instrukcją na dole ekranu
2. Naciśnij ikonę **Udostępnij** (kwadrat ze strzałką w górę)
3. Wybierz **Dodaj do ekranu głównego**
4. Potwierdź klikając **Dodaj**

> **Ważne:** Na iPhone musisz użyć Safari — Chrome/Firefox na iOS nie wspierają instalacji PWA.

### 3. Włącz powiadomienia

Po zainstalowaniu aplikacji pojawi się komunikat **"Włącz powiadomienia o nowych zdjęciach"**. Kliknij **Włącz** — dzięki temu dostaniesz powiadomienie na telefon za każdym razem, gdy ktoś wrzuci nowe zdjęcie lub skomentuje post.

> **iPhone:** Powiadomienia push wymagają iOS 16.4 lub nowszego i działają tylko po zainstalowaniu aplikacji na ekranie głównym.

### 4. Gotowe

Otwieraj Wspólniaka z ekranu głównego, przeglądaj zdjęcia, komentuj, reaguj i wrzucaj swoje. Ostatnio załadowany feed jest dostępny nawet offline.

---

## Self-host

Wspólniak jest projektowany jako **self-hosted first**. Chcesz uruchomić własną instancję dla swojej rodziny? Potrzebujesz:

### Wymagania

- **Konto Cloudflare** (free tier wystarcza dla Workers)
- **Baza danych Neon PostgreSQL** (free tier: 0.5 GiB storage, 190h compute)
- **Subskrypcja Cloudflare Images** (~$5/mies, 100k obrazów + 100k delivery) — wymagana dla automatycznej konwersji HEIC i generacji wariantów (thumbnail/full/avif)
- **Domena** — własna (custom domain w CF) albo darmowa `*.workers.dev`
- **~10 minut** na pierwszy deploy

### Quick start

```bash
# Klonuj repo
git clone https://github.com/CrystalGamesStudio/wspolniak.git
cd wspolniak

# Zainstaluj zależności
pnpm install

# Skonfiguruj wrangler.jsonc (CF Images bindings, custom domain)
# Zobacz docs/ dla szczegółów

# Uruchom lokalnie
pnpm dev

# Deploy na Cloudflare (dev)
pnpm deploy

# Deploy na produkcję
pnpm deploy:production
```

Po pierwszym deploy wejdź na swoją domenę i kliknij `/setup` — pierwsza osoba która wejdzie zostanie adminem swojej instancji i dostanie magic link do skopiowania.

### Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Dev server na porcie 3000 |
| `pnpm build` | Production build |
| `pnpm deploy` | Build + `wrangler deploy` (dev) |
| `pnpm deploy:production` | Build + deploy na produkcję |
| `pnpm test` / `test:watch` / `test:coverage` | Vitest |
| `pnpm types` | Type-check (`tsc --noEmit`) |
| `pnpm lint` / `lint:fix` | Biome |
| `pnpm knip` | Detect unused files, deps, exports |
| `pnpm admin:dev:regenerate` | Regeneruj magic link admina (dev) |
| `pnpm admin:production:regenerate` | Regeneruj magic link admina (prod) |
| `./sync-secrets.sh production` | Sync sekretów z `.production.vars` do CF |

Pełna lista scripts i dev workflow — zobacz [`.claude/CLAUDE.md`](.claude/CLAUDE.md).

### Licencja i Twoje obowiązki

Wspólniak jest objęty licencją **AGPL-3.0-or-later**. To oznacza, że możesz:

✅ Uruchomić instancję dla siebie i swojej rodziny
✅ Modyfikować kod pod swoje potrzeby
✅ Udostępniać zmodyfikowaną wersję innym

Ale **musisz**:

- Udostępnić swoje modyfikacje na tej samej licencji, jeśli jakkolwiek publicznie serwujesz instancję (nawet bez komercjalizacji — AGPL pokrywa "network use")
- Zachować nagłówki autorskie i SPDX

Pełny tekst licencji: [`LICENSE`](LICENSE).

### Prywatność i RODO

Hostując Wspólniaka dla własnej rodziny, zazwyczaj mieścisz się w wyłączeniu "wyłącznie osobistych/domowych celów" (art. 2 ust. 2 lit. c RODO). Wspólniak jest zaprojektowany z myślą o prywatności:

- Zero analytics, zero telemetry
- Żadnych persistent identyfikatorów poza family session cookie
- Zdjęcia są za auth wallem, widoczne tylko dla członków Twojej instancji
- Soft delete (planowany: export + full delete)

**Uwaga**: Jeśli planujesz hostować Wspólniaka dla kogoś spoza swojego gospodarstwa domowego, skonsultuj się z prawnikiem — wychodzisz wtedy poza wyłączenie "domowe" w RODO.

---

## Deploy to Cloudflare

> **Note:** "Deploy to Cloudflare" button wymaga publicznego repo i działającego `wrangler.jsonc` — będzie dodany w Phase 9 (Release Polish). Do tego czasu używaj manualnego quick startu powyżej.

<!--
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/CrystalGamesStudio/wspolniak)
-->

Planowany flow dla self-hosterów:

1. Klikasz **Deploy to Cloudflare** button (powyżej)
2. Cloudflare fork'uje repo na Twoje konto GitHub, tworzy Worker i binding
3. **Aktywujesz Cloudflare Images** w dashboard ($5/mies subscription)
4. Ustawiasz custom domain (opcjonalnie) lub używasz `*.workers.dev`
5. Wchodzisz na swoją domenę → `/setup` → tworzysz konto admina
6. Dostajesz swój pierwszy magic link → instalujesz PWA → zapraszasz rodzinę

---

## Contributing

Wspólniak jest open-source i chętnie przyjmuje PR-y. Zanim zaczniesz pracę:

1. Zajrzyj do [`plans/`](plans/) żeby zobaczyć aktualne PRD i plany fazowania
2. Sprawdź [GitHub issues](https://github.com/CrystalGamesStudio/wspolniak/issues) — każda faza ma swoją issue z acceptance criteria
3. Przeczytaj [`.claude/CLAUDE.md`](.claude/CLAUDE.md) i [`.claude/rules/`](.claude/rules/) — projekt ma formalne konwencje (deep modules, error handling, atomic imports)
4. Quality gates przed PR: `pnpm types && pnpm lint && pnpm test`

---

## License

Copyright © 2026 Crystal Games Studio

Wspólniak is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but **WITHOUT ANY WARRANTY**; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [GNU AGPL License](LICENSE) for more details.
