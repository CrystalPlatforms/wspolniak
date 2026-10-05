---
title: Powiadomienia push pod maską
---

Push w Wspólniaku to standard Web Push z protokołem VAPID — i ciekawostka: zaimplementowany **ręcznie**, bez biblioteki.

## Kanał szyfrowania

- Klucze VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) siedzą w sekretach produkcji; bez nich push jest po cichu wyłączony.
- Autoryzacja żądania wysyłki to JWT ES256 podpisywany kluczem ECDSA (nagłówek `vapid t=…, k=…`, ważność 12 h).
- Treść notyfikacji szyfrowana jest **ECDH P-256 + aes128gcm** — serwer pushowy (Chrome/Firefox/Safari) nie widzi jej treści, tylko dostarcza zaszyfrowany pakiet.
- Klucz publiczny jest publiczny z nazwy: endpoint `/vapid-key` podaje go przeglądarce bez authu, żeby subskrybować.

## Subskrypcje

Tabela `push_subscriptions` trzyma endpoint i klucze per urządzenie. Ciekawostka iOS: Safari **rotuje endpointy**, więc przy zapisie najpierw kasowane są stare endpointy użytkownika, potem zapisywany nowy. Martwe endpointy sprząta się przy dostarczaniu — odpowiedź **410 Gone** kasuje subskrypcję. Każda wysyłka loguje wynik do osobnej domeny zdarzeń doręczeń.

## Co uruchamia powiadomienie

| Zdarzenie | Kto dostaje |
| --- | --- |
| Nowy post | wszyscy aktywni oprócz autora |
| Nowy komentarz | autor posta (bez pingu samego siebie) |
| Wzmianka @ w komentarzu | wymieniona osoba (tylko klik z dropdownu, bez duplikatów) |
| Wiadomość czatu | tylko osoby **niepodłączone** do pokoju czatu, maks. co 2 min na użytkownika |

Reakcje i „kto pisze" nigdy nie pushują — to za dużo szumu dla rodziny.

## Service worker

Odbiór to `public/sw.js`: event `push` pokazuje notyfikację z ikoną i docelowym adresem, kliknięcie **doprowadza do istniejącego okna apki** (albo otwiera nowe). Fan-out do wszystkich urządzeń idzie przez `Promise.allSettled` — jeden martwy endpoint nie blokuje pozostałych.

> **Uwaga:** na iOS powiadomienia webowe działają tylko w aplikacji zainstalowanej na ekranie głównym — dlatego apka pokazuje instrukcję instalacji zanim poprosi o zgodę na push.
