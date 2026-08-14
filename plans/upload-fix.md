# PRD: Naprawa uploadu zdjęć przy słabym Wi-Fi (Wspólniak)

Źródło: Issue #135 – "Błąd w uploadzie"

## Overview
Upload zdjęć w aplikacji Wspólniak zawodzi z komunikatem "Load failed" na produkcji, gdy użytkownik ma słabsze połączenie Wi-Fi. Działa lokalnie, nie działa na prod. Dotyka kilku osób z rodziny i blokuje ich w korzystaniu z appki – priorytet: krytyczny.

## Problem Statement
Przy słabszym Wi-Fi upload zdjęć na produkcji kończy się błędem "Load failed", zamiast się udać albo dać użytkownikowi jasną informację co poszło nie tak. Na localhost problem nie występuje, co sugeruje różnicę środowiskową (np. timeout, brak retry, inna konfiguracja sieci/CDN na produkcji) – dokładna przyczyna jest jeszcze nieznana i wymaga zbadania.

Głosówki (audio) nie są objęte tym problemem – dotyczy wyłącznie zdjęć.

## Users
| Typ użytkownika | Opis | Wolumen |
|---|---|---|
| User (członek rodziny) | Uploaduje zdjęcia z telefonu/przeglądarki, często na słabszym Wi-Fi | Kilka osób już zgłosiło problem |
| Admin | Ma widzieć nieudane uploady w panelu admina | 1 osoba (Test) |

## Goals & Success Criteria
- [ ] Upload zdjęcia kończy się sukcesem lub jasnym błędem w ciągu **7 sekund**, nawet przy słabym Wi-Fi
- [ ] Komunikat błędu jest konkretny (np. "Nie udało się przesłać pliku – sprawdź połączenie" zamiast ogólnego "Load failed")
- [ ] Przy błędzie dostępny jest przycisk otwierający developer tools (do diagnostyki)
- [ ] Użytkownik może ręcznie ponowić nieudany upload (bez automatycznego retry)
- [ ] Admin widzi listę/nieudanych uploadów w panelu admina
- [ ] Naprawa zweryfikowana przez throttlowanie sieci w devtoolsach przeglądarki (symulacja słabego Wi-Fi)

## User Stories
1. Jako user, chcę widzieć konkretny komunikat błędu przy nieudanym uploadzie, żeby wiedzieć co się stało.
2. Jako user, chcę móc ręcznie ponowić upload po błędzie, żeby nie musieć zaczynać od nowa (np. pisać posta ponownie).
3. Jako user, chcę żeby upload zdjęcia kończył się w rozsądnym czasie (~7s) nawet na słabszym Wi-Fi.
4. Jako admin, chcę widzieć listę nieudanych uploadów, żeby wiedzieć czy problem się powtarza i komu pomóc.
5. Jako user/admin, chcę mieć dostęp do developer tools jednym przyciskiem przy błędzie, żeby łatwiej zgłosić/zdiagnozować problem.

## Scope

### In scope
- Konkretne, czytelne komunikaty błędów uploadu (zamiast generycznego "Load failed")
- Przycisk otwierający developer tools przy błędzie uploadu
- Manualny retry uploadu przez użytkownika
- Widok nieudanych uploadów w panelu admina
- Zbadanie przyczyny błędu na produkcji (dlaczego różni się od localhost) – timeout, konfiguracja, limity
- Ewentualna zmiana mechanizmu uploadu (np. chunked upload) **jeśli** okaże się potrzebna do spełnienia celu 7 sekund

### Out of scope
- Automatyczny retry uploadu
- Głosówki (audio) – problem ich nie dotyczy
- Zmiany niezwiązane z uploadem zdjęć

## System Components
- **Frontend (upload UI)**: obsługa błędów, komunikat, przycisk retry, przycisk devtools
- **Backend/API uploadu**: logika przyjmowania pliku, ewentualny chunked upload
- **Cloudflare R2**: docelowe miejsce przechowywania zdjęć (bez zmian w tej fazie, chyba że diagnostyka wykaże inaczej)
- **Panel admina**: nowa sekcja/lista nieudanych uploadów

## Implementation Decisions
| Decision | Choice | Rationale |
|---|---|---|
| Retry | Manualny (user klika "spróbuj ponownie") | Ustalone w dyskusji – prostsze, user ma kontrolę |
| Widoczność błędów dla admina | Tak, lista nieudanych uploadów w panelu admina | Admin chce monitorować powtarzalność problemu |
| Cel czasowy | Upload zdjęcia ≤ 7 sekund, nawet przy słabym Wi-Fi | Zdefiniowane przez product ownera jako miara sukcesu |
| Zmiana mechanizmu uploadu (np. chunked) | Dopuszczalna, jeśli potrzebna do spełnienia celu 7s | Otwartość na zmianę sposobu uploadu jeśli prosta łatka nie wystarczy |
| Przyczyna techniczna błędu | Nieznana – do zbadania | Brak logów/przykładów na start, wymaga diagnostyki na produkcji |

## Validation Strategy
Testowanie ręczne przez throttlowanie sieci w narzędziach deweloperskich przeglądarki (symulacja słabego Wi-Fi), sprawdzenie że:
- upload kończy się sukcesem lub czytelnym błędem w ~7s,
- retry manualny działa,
- błąd pojawia się w panelu admina.

## Open Questions
- [ ] Jaka jest dokładna techniczna przyczyna błędu na produkcji (timeout? limit R2? inna konfiguracja niż localhost?) – wymaga diagnostyki/logów przed implementacją
- [ ] Czy 7 sekund to twardy wymóg dla każdego rozmiaru zdjęcia (do 15MB wg głównego PRD), czy orientacyjny cel dla typowego zdjęcia?

## References
- Discovery summary: inline powyżej (z sesji `/ask`)
- Issue źródłowe: GitHub #135 "Błąd w uploadzie"
- Główny PRD Wspólniaka: `./plans/wspolniak-ai-prd.md` (kontekst produktu, stack: Next.js + TypeScript, PostgreSQL, Cloudflare R2)
