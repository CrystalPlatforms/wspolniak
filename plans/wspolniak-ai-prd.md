# PRD: Wspólniak AI (AL)

## Overview
Wspólniak AI to opcjonalny, włączany w ustawieniach asystent AI wbudowany we Wspólniaka. Pomaga użytkownikom w codziennych czynnościach — generowaniu i poprawianiu opisów oraz odpowiadaniu na pytania o działanie aplikacji — pod jedną spójną, rozpoznawalną marką "AL".

## Problem Statement
Użytkownicy Wspólniaka często nie mają czasu na pisanie opisów pod zdjęciami i postami, przez co ich nie piszą albo piszą je niedbale. Problem dotyczy wszystkich użytkowników niezależnie od roli.

## Users
| User type | Description | Volume |
|-----------|-------------|--------|
| User | Każdy członek rodziny korzystający ze Wspólniaka; funkcja opt-in/opt-out w ustawieniach profilu | Cała rodzina |
| Admin | Dodatkowo konfiguruje dostawcę AI (API Key, Base URL) | 1 osoba |

## Goals & Success Criteria
- [ ] Użytkownicy chętniej dodają opisy do postów/zdjęć dzięki AI
- [ ] Walidacja odbywa się poprzez ręczne testy właściciela produktu (bez formalnych metryk ilościowych)

## User Stories
1. Jako użytkownik, chcę żeby AI zaproponowało opis do mojego zdjęcia, żeby nie musieć pisać go od zera.
2. Jako użytkownik, chcę żeby AI poprawiło mój tekst posta/komentarza, żeby brzmiał lepiej bez wysiłku z mojej strony.
3. Jako użytkownik, chcę, żeby AI zaproponowało nazwę/opis albumu na podstawie zdjęć, żeby nie musieć wymyślać tytułu samodzielnie.
4. Jako użytkownik, chcę móc zapytać asystenta AL, jak coś zrobić we Wspólniaku, żeby nie szukać samodzielnie w interfejsie.
5. Jako użytkownik, chcę móc załączyć bieżącą stronę do rozmowy z AL, żeby dostał trafną, kontekstową podpowiedź.
6. Jako admin, chcę móc skonfigurować dostawcę AI (API Key, Base URL), żeby mieć kontrolę nad tym, gdzie trafiają dane rodziny.
7. Jako użytkownik, chcę móc włączyć/wyłączyć Wspólniak AI w ustawieniach, żeby zdecydować, czy chcę z niego korzystać.

## Scope

### In scope
- Globalny przełącznik "Wspólniak AI" w ustawieniach profilu (włącz/wyłącz), z możliwością włączenia/wyłączenia poszczególnych funkcji
- Ikona AI (gradient jasnozielono-butelkowy) jako spójny wizualny język we wszystkich miejscach z AI
- **Post/komentarz:** jedna ikona AI w prawym górnym rogu pola tworzenia/edycji → menu z opcjami "Zaproponuj opis" i "Popraw opis"
  - Dla komentarzy AI generuje krótsze teksty niż dla postów (adekwatnie do formatu)
- **Album suggestion:** ikona przy grupie zdjęć proponowanych do albumu → propozycja nazwy/opisu na podstawie zdjęć
- **Asystent AL (desktop):** duża ikona w prawym dolnym rogu, widoczna na każdej stronie → otwiera sidebar z czatem; AL zna funkcje Wspólniaka i odpowiada, jak coś zrobić; opcjonalny przycisk "Załącz bieżącą stronę" dający AL kontekst aktualnego widoku
- **Asystent AL (mobile):** pozycja "Asystent AL" w menu → otwiera czat na pełnym ekranie pod ścieżką `/ai`
- Panel admina: pole konfiguracji dostawcy AI — API Key oraz Base URL (kompatybilne z OpenRouter / Groq), edytowalne w dowolnym momencie
- Domyślny/rekomendowany dostawca: **Groq** (brak trenowania na danych, brak trwałej retencji danych klienta)

### Out of scope
- Głosówki (funkcja nie istnieje we Wspólniaku i nie jest planowana)
- Tłumaczenie języków
- Generowanie zdjęć przez AI
- Popołudniowy digest z udziałem AI (zostaje bez zmian, bez AI)
- Twarde metryki sukcesu / dashboard analityczny skuteczności AI

## System Components
- **Komponent UI `<AIButton>`** — globalny, reużywalny element z gradientową ikoną AI, używany konsekwentnie w poście, komentarzu, album suggestion i (w większej wersji) jako uruchomienie asystenta AL
- **Moduł generowania treści** — obsługuje żądania "zaproponuj opis" (na podstawie zdjęcia) i "popraw opis" (na podstawie istniejącego tekstu), z rozróżnieniem długości dla postów vs komentarzy
- **Moduł album suggestion + AI** — rozszerza istniejącą (poza-MVP) funkcję album suggestion o generowanie nazwy/opisu
- **Asystent AL (chat)** — komponent czatu z kontekstem wiedzy o funkcjach Wspólniaka; opcjonalne dołączanie kontekstu bieżącej strony; osobne wejścia dla desktop (sidebar) i mobile (pełny ekran `/ai`)
- **Warstwa integracji AI** — konfigurowalne połączenie z dostawcą modelu (API Key + Base URL) zarządzane przez admina, domyślnie wskazujące na Groq

## Implementation Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Dostawca AI (domyślny) | Groq | Brak trenowania na danych klienta, brak trwałej retencji (logi błędów/nadużyć max. 30 dni) — najbezpieczniejsza opcja dla zdjęć rodzinnych spośród rozważanych (Groq, OpenRouter, build.nvidia.com) |
| Konfiguracja dostawcy | API Key + Base URL, edytowalne przez admina w ustawieniach | Elastyczność zmiany dostawcy w przyszłości bez zmian w kodzie |
| Widoczność funkcji AI | Ujednolicona ikona z gradientem jasnozielono-butelkowym w każdym miejscu użycia | Spójność wizualna, natychmiastowa rozpoznawalność "tu można użyć AI" |
| Dostęp do funkcji | Opt-in/opt-out per użytkownik w ustawieniach profilu, z rozbiciem na poszczególne funkcje | Niektórzy użytkownicy (mniej techniczni, introwertycy) mogą nie chcieć wszystkich funkcji naraz |
| Asystent AL — desktop | Pływająca ikona w prawym dolnym rogu + sidebar | Stały, przewidywalny dostęp bez zasłaniania treści |
| Asystent AL — mobile | Wpis w menu + pełny ekran pod `/ai` | Ograniczona przestrzeń ekranu mobilnego wyklucza sidebar |
| Kontekst strony dla AL | Opcjonalny, użytkownik sam decyduje (przycisk "Załącz bieżącą stronę") | Użytkownik zachowuje kontrolę nad tym, co AI widzi |
| Długość generowanego tekstu | Krótsza dla komentarzy niż dla postów | Komentarze z natury są krótkie, AI ma to respektować |

## Validation Strategy
Właściciel produktu testuje funkcję osobiście przed i po wdrożeniu na produkcję. Brak formalnych testów użytkowników ani metryk ilościowych na tym etapie.

## References
- Discovery summary: inline w rozmowie poprzedzającej ten PRD (sesja `/ask` z dnia bieżącego)
- Bazowy PRD Wspólniaka: sekcja 6.5 (Albums — album suggestion), sekcja 10 (Pomysły — głosy ElevenLabs, poza zakresem tego PRD)
