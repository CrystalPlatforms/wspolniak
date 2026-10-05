---
title: Limity i wydajność
---

Wspólniak ma twarde limity w kilku miejscach — chronią rodzinny budżet (Cloudflare, YouTube) i wydajność na słabych łączach. Oto pełna lista liczb z kodu.

## Multimedia

| Limit | Wartość | Gdzie egzekwowany |
| --- | --- | --- |
| Rozmiar zdjęcia | 19 MB | klient, przed publikacją (dialog ze zmniejszaniem) |
| Zdjęć na post | 10 | formularz posta |
| Wideo na post | 5 | schemat posta |
| Nowe wideo na dobę | 5 (reset o północy UTC) | endpoint sesji uploadu — 429 po przekroczeniu |
| Rozmiar wideo | 2 GiB | 413 przy starcie uploadu |
| Opis posta | 2000 znaków | Zod |

## Sieć i czas

- **Szybkie żądania JSON** (np. utworzenie posta, pobranie par upload) mają timeout **7 s** — zerwane łącze kończy się czytelnym błędem, nie wiecznym kręceniem.
- **Upload samego pliku nie ma twardego timeoutu** — świadomie: licznik przerywał transfery, które i tak by się dokończyły. Upload leci do skutku, z podglądem progresu w bajtach.
- **Ostrzeżenie o wolnym łączu**: jeśli zmierzona przepustowość spada poniżej ~100 KB/s, po uploadzie pokazuje się jednorazowa informacja (raz na plik) — bez przerywania transferu.
- **Równoległość uploadu zdjęć: 2 pliki naraz** — kompresja kolejnego zdjęcia idzie w trakcie wysyłania poprzedniego (pipelining).

## Treść i interakcje

| Limit | Wartość |
| --- | --- |
| Wiadomość czatu | 200 znaków |
| Czat — tempo wysyłania | 10 wiadomości na minutę na użytkownika |
| Życie wiadomości czatu | 24 h |
| Posty na dobę | 50 |
| Elementów albumu | 500 (10 na jedno żądanie) |
| Logowanie kodem dostępu | 5 prób na minutę na IP |

## AI (AL)

Limity na użytkownika i model, okno 60 s: **AL Max 1/min, AL Pro 2/min, AL Lite 5/min**, szukanie postów przez AL 6/min. Wyczerpany limit droższego modelu nie blokuje lżejszego.

## Wydajność

- **Cloudflare Images** serwuje gotowe warianty (`thumbnail` na karty, `public` na widok) — przeglądarka nigdy nie pobiera pełnego rozmiaru „na ślepo".
- Miniatury na kartach feedu ładują się **leniwie** (`loading="lazy"`).
- **Service worker** cache'uje powłokę apki i statyczne assety — offline apka nadal pokazuje ostatni feed (szczegóły w artykule o PWA).

> **Uwaga:** limity są stałymi w kodzie i podnoszone świadomie — twardy sufit Cloudflare Images to 20 MB, dlatego zdjęcia mają bezpieczne 19 MB.
