# Implementation Plan: Wspólniak Biblioteka

**PRD:** [wspolniak-biblioteka-prd.md](./wspolniak-biblioteka-prd.md)
**Created:** 2026-08-06

---

## Phase 1 — Walking Skeleton [AFK]

**Goal:** Użytkownik może zapisać post i zobaczyć go w sekcji Biblioteka — cały przepływ działa end-to-end, bez polishu.

**Slices:**
- [ ] Migracja bazy danych — tabela `bookmarks` (id, user_id, post_id, created_at)
- [ ] Backend: endpoint `POST /bookmarks` — dodaj zakładkę
- [ ] Backend: endpoint `DELETE /bookmarks/:postId` — usuń zakładkę
- [ ] Backend: endpoint `GET /bookmarks` — pobierz zakładki zalogowanego użytkownika (posortowane created_at DESC)
- [ ] Frontend: prosty przycisk zakładki na karcie posta (bez animacji) — wywołuje API
- [ ] Frontend: nowa strona `/biblioteka` — lista zapisanych postów (surowa, bez stylowania)

**Acceptance criteria:**
- Kliknięcie przycisku zapisuje post w DB
- Ponowne kliknięcie usuwa go z DB
- Strona `/biblioteka` pokazuje poprawne posty zalogowanego użytkownika

**Blockers / dependencies:** Brak

---

## Phase 2 — UI & UX polishing [AFK]

**Goal:** Ikona zakładki wygląda poprawnie, zmienia kolor na żółty, Biblioteka wygląda jak feed.

**Slices:**
- [ ] Frontend: ikona zakładki z ikoną (np. BookmarkIcon z biblioteki ikon projektu)
- [ ] Frontend: stan ikony — szara (unsaved) / żółta (saved) z animacją toggle
- [ ] Frontend: optimistic update — ikona reaguje natychmiast bez czekania na API
- [ ] Frontend: strona `/biblioteka` używa tego samego komponentu PostCard co feed
- [ ] Frontend: ikona zakładki pojawia się też na stronie pojedynczego posta (obok reakcji)

**Acceptance criteria:**
- Ikona płynnie przełącza się między stanami
- Biblioteka wygląda identycznie jak feed
- Ikona działa w feedzie i na stronie posta

**Blockers / dependencies:** Phase 1

---

## Phase 3 — Nawigacja & Empty State [AFK]

**Goal:** Biblioteka jest dostępna z menu, pusty stan jest obsłużony.

**Slices:**
- [ ] Frontend: link "Biblioteka" w menu głównym (sidebar / nav)
- [ ] Frontend: empty state na stronie `/biblioteka` — komunikat gdy brak zapisanych postów (np. ilustracja + tekst "Nie masz jeszcze zapisanych postów")
- [ ] Frontend: licznik zapisanych postów przy ikonie menu (opcjonalnie — badge)

**Acceptance criteria:**
- Z menu można przejść do Biblioteki jednym kliknięciem
- Pusty stan jest przyjazny i zrozumiały dla użytkownika

**Blockers / dependencies:** Phase 2

---

## Phase 4 — Hardening & Edge Cases [AFK]

**Goal:** Obsługa błędów, przypadki brzegowe, bezpieczeństwo.

**Slices:**
- [ ] Backend: gdy post zostaje usunięty → kaskadowe usunięcie z tabeli `bookmarks` (ON DELETE CASCADE lub soft delete handler)
- [ ] Backend: autoryzacja — użytkownik może widzieć / modyfikować tylko swoje zakładki
- [ ] Frontend: obsługa błędów API (np. toast gdy zapis nie powiedzie się)
- [ ] Frontend: rollback optimistic update gdy API zwróci błąd
- [ ] Testy: weryfikacja że zakładki są prywatne (user A nie widzi zakładek user B)

**Acceptance criteria:**
- Usunięcie posta kasuje go z Biblioteki wszystkich użytkowników
- Użytkownik nie może dostać się do cudzych zakładek przez API
- Błędy sieciowe są obsługiwane gracefully

**Blockers / dependencies:** Phase 3

---

## Phases overview

| Phase | Goal | AFK/HITL | Depends on |
|-------|------|----------|------------|
| 1 | Walking Skeleton — przepływ end-to-end | AFK | — |
| 2 | UI & UX polishing | AFK | Phase 1 |
| 3 | Nawigacja & Empty State | AFK | Phase 2 |
| 4 | Hardening & Edge Cases | AFK | Phase 3 |
