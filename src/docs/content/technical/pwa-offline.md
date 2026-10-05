---
title: PWA i tryb offline
---

Wspólniak jest PWA — da się go zainstalować jak apkę i używać bez internetu, w granicach rozsądku.

## Instalacja

- Manifest (`public/manifest.webmanifest`): nazwa „Wspólniak", tryb `standalone`, start na `/app`, motyw ciemny (`#18181b`), ikony 192/512 + maskable pod Apple.
- Na Androidzie/Chromium apka słucha `beforeinstallprompt` i pokazuje baner instalacji; iOS Safari nie ma tego eventu — dlatego osobny baner z instrukcją „Dodaj do ekranu głównego".
- Dopiero w trybie zainstalowanym (standalone) apka prosi o zgodę na push — na iOS to wymóg platformy.

## Service worker

Rejestrowany jest tylko **na produkcji** (w dev usuwa stare workery, żeby nie mieszał z HMR). Wersjonowanie cache'a robi build — nazwa cache zawiera identyfikator builda, więc nowy deploy automatycznie wypiera stary cache, a instalacja kasuje nieaktualne wersje.

Strategie pobierania:

| Co | Strategia |
| --- | --- |
| Strony (`/`, `/app`) | network-first, awaryjnie cache — offline pokazuje **ostatni wyrenderowany feed** (HTML `/app` niesie zdehydrowany stan) |
| Statyczne assety (JS, CSS, obrazy, fonty) | cache-first na produkcji (natychmiast), network-first na localhost (żeby HMR żył) |
| API (`/api/*`) | **nigdy** z cache — zawsze sieć |

## Offline w praktyce

- Mutacje (dodanie posta, komentarza) przy braku sieci są **odrzucane od razu** z czytelnym komunikatem — nie ma kolejki „wyśle się później".
- Pasek statusu: apka nasłuchuje zdarzeń `online`/`offline` i pokazuje czerwony pasek „Brak połączenia".

> **Uwaga:** offline feed pochodzi z cache'u service workera, nie z localStorage — dlatego po odwiedzeniu apki z siecią ostatni feed odtwarza się sam, bez dodatkowego zapisu.
