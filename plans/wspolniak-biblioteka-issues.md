# Issues: Wspólniak Biblioteka

**Plan:** [wspolniak-biblioteka-plan.md](./wspolniak-biblioteka-plan.md)
**Created:** 2026-08-06

---

## [Phase 1] Migracja bazy danych — tabela bookmarks

**Type:** Chore
**Classification:** AFK
**Phase:** 1

### Context
Potrzebujemy tabeli w bazie danych do przechowywania informacji o tym, który użytkownik zapisał który post.

### Acceptance criteria
- [ ] Tabela `bookmarks` istnieje w bazie z polami: `id`, `user_id`, `post_id`, `created_at`
- [ ] `user_id` i `post_id` to klucze obce z relacją ON DELETE CASCADE
- [ ] Migracja przechodzi bez błędów na środowisku deweloperskim
- [ ] Unikalny constraint na parze `(user_id, post_id)` — jeden user nie może dwa razy zapisać tego samego posta

### Technical notes
Sprawdź istniejące migracje w projekcie i dopasuj styl (Drizzle ORM).

### Blockers
- Brak

---

## [Phase 1] Backend: endpoint POST /bookmarks

**Type:** Feature
**Classification:** AFK
**Phase:** 1

### Context
Endpoint umożliwiający zalogowanemu użytkownikowi zapisanie posta do swojej Biblioteki.

### Acceptance criteria
- [ ] `POST /bookmarks` z body `{ postId }` tworzy rekord w tabeli bookmarks
- [ ] Endpoint wymaga autoryzacji — tylko zalogowany użytkownik
- [ ] Jeśli post jest już zapisany — zwraca 409 lub ignoruje (idempotentne)
- [ ] Zwraca 201 przy sukcesie

### Blockers
- Requires: #1 — Migracja bazy danych

---

## [Phase 1] Backend: endpoint DELETE /bookmarks/:postId

**Type:** Feature
**Classification:** AFK
**Phase:** 1

### Context
Endpoint umożliwiający odpięcie posta z Biblioteki.

### Acceptance criteria
- [ ] `DELETE /bookmarks/:postId` usuwa rekord z bookmarks dla zalogowanego użytkownika
- [ ] Endpoint wymaga autoryzacji
- [ ] Użytkownik może usuwać tylko swoje zakładki
- [ ] Zwraca 200/204 przy sukcesie, 404 gdy nie istnieje

### Blockers
- Requires: #1 — Migracja bazy danych

---

## [Phase 1] Backend: endpoint GET /bookmarks

**Type:** Feature
**Classification:** AFK
**Phase:** 1

### Context
Endpoint pobierający listę zapisanych postów zalogowanego użytkownika, posortowanych od najnowiej zapisanego.

### Acceptance criteria
- [ ] `GET /bookmarks` zwraca posty z tabeli bookmarks dla zalogowanego użytkownika
- [ ] Posty posortowane wg `bookmarks.created_at DESC`
- [ ] Zwraca pełne dane posta (takie same jak endpoint feeda)
- [ ] Endpoint wymaga autoryzacji

### Blockers
- Requires: #1 — Migracja bazy danych

---

## [Phase 1] Frontend: przycisk zakładki na PostCard (podstawowy)

**Type:** Feature
**Classification:** AFK
**Phase:** 1

### Context
Prosty przycisk zakładki na karcie posta — bez animacji, tylko wywołanie API. Proof of concept dla całego przepływu.

### Acceptance criteria
- [ ] Przycisk zakładki widoczny na każdej karcie posta
- [ ] Kliknięcie wywołuje `POST /bookmarks` lub `DELETE /bookmarks/:postId`
- [ ] Stan przycisku odzwierciedla czy post jest zapisany

### Blockers
- Requires: #2 — POST /bookmarks
- Requires: #3 — DELETE /bookmarks/:postId

---

## [Phase 1] Frontend: strona /biblioteka (surowa)

**Type:** Feature
**Classification:** AFK
**Phase:** 1

### Context
Nowa strona wyświetlająca zapisane posty zalogowanego użytkownika. Na tym etapie bez stylowania — tylko działający widok.

### Acceptance criteria
- [ ] Strona `/biblioteka` istnieje i jest dostępna po wpisaniu URL
- [ ] Pobiera dane z `GET /bookmarks`
- [ ] Wyświetla listę zapisanych postów
- [ ] Wymaga zalogowania — redirect dla niezalogowanych

### Blockers
- Requires: #4 — GET /bookmarks

---

## [Phase 2] Frontend: ikona zakładki z ikoną i stanem wizualnym

**Type:** Feature
**Classification:** AFK
**Phase:** 2

### Context
Ulepszenie przycisku zakładki — poprawna ikona, zmiana koloru na żółty, toggle działa płynnie.

### Acceptance criteria
- [ ] Ikona zakładki z biblioteki ikon projektu (BookmarkIcon lub podobna)
- [ ] Stan unsaved: ikona szara / outline
- [ ] Stan saved: ikona żółta / filled
- [ ] Animacja przejścia między stanami (subtle transition)

### Blockers
- Requires: #5 — Podstawowy przycisk zakładki

---

## [Phase 2] Frontend: optimistic update dla zakładki

**Type:** Feature
**Classification:** AFK
**Phase:** 2

### Context
Ikona reaguje natychmiast na kliknięcie bez czekania na odpowiedź API — lepszy UX.

### Acceptance criteria
- [ ] Kliknięcie natychmiast zmienia stan ikony
- [ ] Jeśli API zwróci błąd — ikona wraca do poprzedniego stanu
- [ ] Brak migotania lub opóźnień wizualnych

### Blockers
- Requires: #7 — Ikona z wizualnym stanem

---

## [Phase 2] Frontend: strona /biblioteka używa komponentu PostCard

**Type:** Feature
**Classification:** AFK
**Phase:** 2

### Context
Biblioteka powinna wyglądać identycznie jak feed — używa tego samego komponentu PostCard.

### Acceptance criteria
- [ ] Strona `/biblioteka` renderuje posty przez ten sam PostCard co feed
- [ ] Wszystkie funkcje PostCard działają w Bibliotece (reakcje, komentarze, itp.)
- [ ] Ikona zakładki na PostCard w Bibliotece też działa (toggle odpina post)

### Blockers
- Requires: #6 — Strona /biblioteka surowa
- Requires: #7 — Ikona z wizualnym stanem

---

## [Phase 2] Frontend: ikona zakładki na stronie pojedynczego posta

**Type:** Feature
**Classification:** AFK
**Phase:** 2

### Context
Ikona zakładki musi być też widoczna na stronie szczegółowej posta, obok sekcji reakcji.

### Acceptance criteria
- [ ] Ikona zakładki widoczna na stronie `/post/:id` obok reakcji
- [ ] Zachowanie identyczne jak w feedzie (toggle, żółty kolor, optimistic update)

### Blockers
- Requires: #7 — Ikona z wizualnym stanem
- Requires: #8 — Optimistic update

---

## [Phase 3] Frontend: link "Biblioteka" w menu głównym

**Type:** Feature
**Classification:** AFK
**Phase:** 3

### Context
Użytkownik musi mieć łatwy dostęp do Biblioteki z poziomu nawigacji głównej.

### Acceptance criteria
- [ ] Link "Biblioteka" widoczny w menu / sidebarze
- [ ] Kliknięcie przenosi na stronę `/biblioteka`
- [ ] Link aktywny (highlight) gdy jesteśmy na stronie Biblioteki

### Blockers
- Requires: #9 — Strona /biblioteka z PostCard

---

## [Phase 3] Frontend: empty state dla Biblioteki

**Type:** Feature
**Classification:** AFK
**Phase:** 3

### Context
Gdy użytkownik nie ma żadnych zapisanych postów, strona musi pokazać przyjazny komunikat zamiast pustej listy.

### Acceptance criteria
- [ ] Empty state widoczny gdy `bookmarks` zwraca pustą listę
- [ ] Komunikat zrozumiały, np. "Nie masz jeszcze zapisanych postów. Kliknij 🔖 przy poście, aby go zapisać."
- [ ] Opcjonalnie: ilustracja lub ikona

### Blockers
- Requires: #11 — Link w menu
- Requires: #9 — Strona /biblioteka z PostCard

---

## [Phase 4] Backend: kaskadowe usuwanie z bookmarks

**Type:** Chore
**Classification:** AFK
**Phase:** 4

### Context
Gdy post zostaje usunięty, musi znikać z Biblioteki wszystkich użytkowników którzy go zapisali.

### Acceptance criteria
- [ ] Usunięcie posta usuwa powiązane rekordy w tabeli `bookmarks` (ON DELETE CASCADE lub explicit handler)
- [ ] Weryfikacja: usuń post → sprawdź że zniknął z bookmarks w DB

### Blockers
- Requires: #1 — Migracja bazy danych

---

## [Phase 4] Backend: autoryzacja — user widzi tylko swoje zakładki

**Type:** Chore
**Classification:** AFK
**Phase:** 4

### Context
Zabezpieczenie przed dostępem do cudzych zakładek przez API.

### Acceptance criteria
- [ ] `GET /bookmarks` zwraca wyłącznie zakładki zalogowanego użytkownika
- [ ] `DELETE /bookmarks/:postId` nie pozwala usunąć cudzej zakładki (403)
- [ ] Test: user A nie może pobrać zakładek user B przez manipulację requestem

### Blockers
- Requires: #2, #3, #4

---

## [Phase 4] Frontend: obsługa błędów API

**Type:** Chore
**Classification:** AFK
**Phase:** 4

### Context
Gdy zapis lub odpięcie zakładki się nie powiedzie — użytkownik musi o tym wiedzieć.

### Acceptance criteria
- [ ] Toast / snackbar gdy API zwróci błąd przy zapisywaniu
- [ ] Toast gdy API zwróci błąd przy odpinaniu
- [ ] Rollback optimistic update przy błędzie (ikona wraca do poprzedniego stanu)

### Blockers
- Requires: #8 — Optimistic update

---

## Summary

| # | Title | Phase | AFK/HITL | Blocks |
|---|-------|-------|----------|--------|
| 1 | Migracja DB — tabela bookmarks | 1 | AFK | — |
| 2 | Backend: POST /bookmarks | 1 | AFK | #1 |
| 3 | Backend: DELETE /bookmarks/:postId | 1 | AFK | #1 |
| 4 | Backend: GET /bookmarks | 1 | AFK | #1 |
| 5 | Frontend: przycisk zakładki (podstawowy) | 1 | AFK | #2, #3 |
| 6 | Frontend: strona /biblioteka (surowa) | 1 | AFK | #4 |
| 7 | Frontend: ikona z wizualnym stanem | 2 | AFK | #5 |
| 8 | Frontend: optimistic update | 2 | AFK | #7 |
| 9 | Frontend: /biblioteka z PostCard | 2 | AFK | #6, #7 |
| 10 | Frontend: ikona na stronie posta | 2 | AFK | #7, #8 |
| 11 | Frontend: link Biblioteka w menu | 3 | AFK | #9 |
| 12 | Frontend: empty state | 3 | AFK | #9, #11 |
| 13 | Backend: kaskadowe usuwanie | 4 | AFK | #1 |
| 14 | Backend: autoryzacja | 4 | AFK | #2, #3, #4 |
| 15 | Frontend: obsługa błędów API | 4 | AFK | #8 |
