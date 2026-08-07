# PRD: Wspólniak Biblioteka

## Overview

Funkcja pozwalająca użytkownikom Wspólniaka zapisywać posty na później i przeglądać je w dedykowanej sekcji "Biblioteka". Każdy użytkownik ma prywatną bibliotekę — widzi tylko swoje zapisane posty.

## Problem Statement

Użytkownicy przeglądają feed i natrafiają na posty, do których chcą wrócić później. Brak mechanizmu zapisywania sprawia, że posty giną w feedzie. Funkcja "Biblioteka" rozwiązuje ten problem poprzez prosty mechanizm zakładki.

## Users

| User type | Opis | Szacunkowy wolumen |
|-----------|------|---------------------|
| Użytkownik Wspólniaka | Każda osoba zalogowana na platformie | Wszyscy aktywni użytkownicy |

## Goals & Success Criteria

- [ ] Użytkownik może zapisać dowolny post jednym kliknięciem
- [ ] Zapisane posty są dostępne w sekcji "Biblioteka" z poziomu menu
- [ ] Ikona zakładki zmienia kolor na żółty po zapisaniu
- [ ] Biblioteka wyświetla posty w kolejności od najnowiej zapisanego
- [ ] Usunięty post znika automatycznie z Biblioteki wszystkich użytkowników
- [ ] Użytkownik może ręcznie usunąć post z Biblioteki

## User Stories

1. Jako użytkownik, chcę kliknąć ikonkę zakładki przy poście, aby zapisać go do mojej Biblioteki na później.
2. Jako użytkownik, chcę widzieć że zakładka jest żółta, abym wiedział że post jest już zapisany.
3. Jako użytkownik, chcę kliknąć żółtą zakładkę ponownie, aby usunąć post z Biblioteki.
4. Jako użytkownik, chcę otworzyć sekcję "Biblioteka" z menu, aby zobaczyć wszystkie moje zapisane posty.
5. Jako użytkownik, chcę widzieć zapisane posty w tym samym formacie co feed, abym mógł je normalnie czytać i reagować.
6. Jako użytkownik, chcę żeby usunięty post znikał automatycznie z Biblioteki, aby nie widzieć martwych wpisów.

## Scope

### In scope
- Ikona zakładki na każdym poście (w feedzie i na stronie posta, obok sekcji reakcji)
- Zmiana koloru ikony na żółty po zapisaniu
- Toggle — jedno kliknięcie zapisuje, drugie odpina
- Sekcja "Biblioteka" dostępna z menu głównego
- Lista zapisanych postów w formacie identycznym z feedem
- Sortowanie: najnowiej zapisane na górze
- Brak limitu zapisanych postów
- Prywatność: każdy widzi tylko swoje zapisane posty
- Automatyczne usuwanie posta z Biblioteki gdy autor go usunie

### Out of scope
- Foldery / kategorie w Bibliotece
- Udostępnianie swojej Biblioteki innym użytkownikom
- Statystyki ile razy post został zapisany (dla autora lub admina)
- Powiadomienia dla autora gdy ktoś zapisze jego post

## System Components

```
[Post Card / Post Page]
  └── BookmarkButton
        ├── Stan: saved / unsaved
        └── Kolor: żółty (saved) / szary (unsaved)

[Menu główne]
  └── Biblioteka (link)
        └── BibliotecaFeed
              ├── Lista SavedPost (format identyczny z feedem)
              └── Sortowanie: created_at DESC (data zapisu)

[Backend]
  └── Tabela: bookmarks
        ├── id
        ├── user_id (FK → users)
        ├── post_id (FK → posts)
        └── created_at
```

## Implementation Decisions

| Decyzja | Wybór | Uzasadnienie |
|---------|-------|--------------|
| Prywatność | Biblioteka prywatna per użytkownik | Decyzja zespołu |
| Sortowanie | Najnowiej zapisane na górze | Intuicyjne UX |
| Ikona | Zakładka, żółta gdy aktywna | Spójność z konwencją platform społecznościowych |
| Limit | Brak | Decyzja zespołu |
| Powiadomienia | Brak | Out of scope v1 |
| Usunięty post | Znika z Biblioteki | Brak martwych wpisów |

## Validation Strategy

Wewnętrzne testy zespołu przed wdrożeniem — brak formalnego user testingu zaplanowanego dla v1.

## Open Questions

- [ ] Czy ikona zakładki pojawia się też w innych widokach (np. post w powiadomieniach, post udostępniony)?
- [ ] Co pokazuje Biblioteka gdy jest pusta — pusty stan z komunikatem?
- [ ] Czy post usunięty przez admina (moderacja) też znika z Biblioteki?

## References

- Discovery summary: discovery_summary_biblioteka.md
