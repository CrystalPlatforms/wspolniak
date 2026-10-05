---
title: Upload zdjęć pod maską
---

Droga zdjęcia od aparatu w telefonie do karty w feedzie ma kilka etapów — każdy zaprojektowany tak, żeby działał też na słabym łączu i ze zdjęciami z iPhone'a.

## Przebieg uploadu

1. **Prośba o adresy** — klient pyta API o „direct upload URL" (jedno lub wiele naraz). Serwer tylko pośredniczy: woła REST Cloudflare Images i zwraca pary `{cfImageId, uploadURL}`.
2. **Wysyłka** — przeglądarka wgrywa plik **bezpośrednio do Cloudflare** po zwróconym adresie (XHR z realnym progresem w bajtach). Worker nie przepuszcza przez siebie ani jednego bajtu zdjęcia.
3. **Publikacja** — klient wysyła JSON z utworzeniem posta (timeout 7 s).
4. **Serwowanie** — Cloudflare Images robi resztę: konwersja HEIC z iPhone'a, warianty rozmiarów (`thumbnail`, `public`) i globalne CDN.

## Kompresja po stronie telefonu

Zdjęcia są zmniejszane **lokalnie, w Web Workerze** — UI nie zacinają się podczas pracy:

- domyślna kompresja przy dodawaniu do posta: maks. 1200 px, jakość 0.7, wynik WebP
- drugi poziom dla za dużych plików (dialog „Zdjęcie jest za duże"): drabinka prób 1600 → 1200 → 1000 → 800 px, aż plik zmieści się w limicie 19 MB; oryginał na telefonie zostaje nietknięty

## Odporność na wolne łącze

- progres liczony z realnych bajtów XHR („Zdjęcie 2/10 — 45%")
- pomiar przepustowości: poniżej ~100 KB/s (po krótkim oknie pomiaru) pojawia się ostrzeżenie o wolnym łączu — **raz na plik**, bez przerywania uploadu
- upload pliku nie ma twardego timeoutu — leci do skutku
- dwa pliki lecą równolegle, kolejne kompresują się w tle (pipelining), wyniki wracają w kolejności wejścia

## Błędy

Każdy etap ma własną klasę błędu (`UploadFlowError`) z etapem (`prośba o adresy`, `kompresja`, `wysyłka`, `publikacja`) i rodzajem (`timeout`, `sieć`, `HTTP`, `nieznany`) — dzięki temu użytkownik widzi, co dokładnie nie zadziałało, a nie generyczny „błąd".

## Sprzątanie

Usunięcie posta lub albumu kasuje też zdjęcia z Cloudflare Images (pojedynczo lub hurtowo); odpowiedź 404 przy kasowaniu traktowana jest jako sukces (już nie istnieje = dobrze).

> **Uwaga:** formularze przyjmują JPEG, PNG, WebP i HEIC/HEIF — dekodowanie iPhone'owych HEIC-ów robi po stronie Cloudflare, kod apki dostaje już gotowe warianty.
