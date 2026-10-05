---
title: Czat w czasie rzeczywistym
---

Czat rodzinny działa w czasie rzeczywistym dzięki połączeniu **WebSocket przez Durable Object** — mały „pokój" (ChatRoom) po stronie Cloudflare, w którym rodzina jest na żywo.

## Architektura

- Jedna instancja Durable Object dla całej rodziny; każde żądanie upgrade'u HTTP → WebSocket przechodzi najpierw przez weryfikację sesji — Worker przekazuje DO tylko zaufany nagłówek z identyfikatorem użytkownika.
- **Odbieranie**: serwer rozsyła eventy przez WebSocket — `message`, `reaction`, `delete` i anonimowy `typing` (nadawca nie dostaje własnego echa).
- **Wysyłanie**: zawsze zwykłym POST-em do API. Serwer zapisuje wiadomość do bazy, a potem każe pokojowi rozesłać ją wszystkim — dzięki temu zapis i rozgłoszenie są spójne.
- Klient po zerwaniu połączenia łączy się ponownie z rosnącym odstępem (1 s → 2 s → 4 s … max 15 s) i deduplikuje wiadomości po id.

## Okno 24 godzin

Wiadomość czatu żyje **24 godziny** — w bazie ma datę wygaśnięcia ustawianą przy zapisie, listowanie zawsze filtruje po „jeszcze żywe", a cron sprząta wygasłe w tle. To decyzja produktowa: czat jest do szybkiej rozmowy, trwałe wspomnienia lądują w postach.

## Funkcje na żywo

- **Reakcje** — te same trzy typy co w feedzie, jedna reakcja na użytkownika (toggle), rozgłoszenie z imieniem autora.
- **Odpowiedzi** — cytat zapisywany jest jako **snapshot w chwili wysyłki**, więc odpowiadasz na wiadomość, która zaraz wygaśnie, i cytat i tak zostaje widoczny.
- **Wzmianki @** — podświetlenie nazwiska i dropdown w polu wpisywania; w czacie są **tylko wizualne** (bez osobnego powiadomienia push — powiadomienia czatowe są generyczne).
- **Komendy i linki** — `/` otwiera listę komend (np. `/link`), linki wstawiane są jako bezpieczne tokeny z normalizacją adresu i blokadą `javascript:`.

## Limity

- 200 znaków na wiadomość, **10 wiadomości na minutę** na użytkownika (limit liczony w pamięci Durable Object — nadużycie kończy się 429 zanim wiadomość trafi do bazy).
- Powiadomienia push z czatu dostają **tylko osoby niepodłączone** do pokoju (kto siedzi w czacie, nie dostaje pusha o własnej rozmowie) i nie częściej niż co 2 minuty na użytkownika.

> **Uwaga:** DO nie pisze do bazy — baza to wyłącznie droga przez zwykłe endpointy API, a pokój służy do rozgłaszania na żywo.
