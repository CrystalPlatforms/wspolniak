---
title: Bezpieczeństwo i prywatność
---

Wspólniak jest prywatny z założenia: jedna rodzina, jeden admin, zero haseł. Poniżej jak realnie działa dostęp i ochrona danych.

## Logowanie bez haseł

Nikt w Wspólniaku nie ma hasła. Każdy członek rodziny ma **własny, jednorazowy link logowania** (magic link):

- link zawiera losowy token (32 losowe bajty), w bazie zapisany jest wyłącznie jego **hash SHA-256** — sam token nigdy nie ląduje w bazie
- każdy członek dostaje nowy link przy każdej próbie logowania, więc stare linki przestają działać
- link przypomina hasło — nie należy go nikomu przekazywać, bo każdy, kto go otworzy, wejdzie na konto

## Sesja

Po wejściu przez link serwer wystawia podpisane ciasteczko sesyjne (`session`): JWT podpisany HMAC-em, ważny **1 rok**, flagi `httpOnly` (niedostępne dla JavaScriptu na stronie) i `sameSite=Lax`, po HTTPS dodatkowo `secure`. Przy każdym żądaniu serwer weryfikuje podpis **i** sprawdza w bazie, że konto nadal jest aktywne — usunięty członek traci dostęp natychmiast, nie po wygaśnięciu ciasteczka.

## Kontrola dostępu w API

Nie ma jednego globalnego filtra — każdy endpoint jawnie deklaruje, kogo wpuszcza:

- middleware **auth** weryfikuje sesję na endpointach aplikacji
- middleware **admin** dodatkowo pilnuje strefy admina (członkowie, YouTube, przełączniki)
- dane wejściowe każdego endpointu są walidowane schematami **Zod** przed dotknięciem bazy

## Limity prób

Endpointy logowania przez kod dostępu (udostępnianie albumów) mają rate limiting: **5 prób na minutę z jednego adresu IP**. Limit jest trzymany w pamięci procesu Workera i resetuje się przy jego restarcie — świadoma decyzja dla rodzinnej skali.

## Sekrety i klucze

Wszystkie sekrety (baza Neon, klucze Cloudflare Images, YouTube, Groq, VAPID) żyją poza kodem: lokalnie w gitignored `.dev.vars` / `.production.vars`, na produkcji jako sekrety Wranglera. W repo nie ma żadnego klucza — pilnuje tego automatyczny **zero-secrets test**, który skanuje też całą treść docsów po wzorcach kształtów kluczy API.

## Izolacja docsów

Docsy serwuje ten sam Worker co apkę, ale rozdzielone są po hoście (`docs.*`): inny host = inna treść, a ścieżki docsów z hosta apki tylko przekierowują (301) na subdomenę. Dokumentacja nie miesza się z aplikacją.

> **Uwaga:** dane rodziny (posty, komentarze, czat) leżą w jednej bazie Neon dostępnej wyłącznie dla Workera — bez publicznych endpointów odczytu poza sesją zalogowanej rodziny.
