---
title: Wideo pod maską
---

„Wspólniak Wideo" to jeden sposób dodawania filmów: **upload przez YouTube**. Post przechowuje wyłącznie referencje (id, tytuł, miniaturę) — pliki wideo nigdy nie leżą w bazie ani u Cloudflare.

## Droga filmu

1. **Połączenie OAuth** — admin łączy konto YouTube (zakres `youtube.upload`); refresh token siedzi zaszyfrowany AES w bazie, stan OAuth jest podpisany (ochrona CSRF).
2. **Sesja uploadu** — endpoint sprawdza **dzienny limit 5 wideo** (reset o północy UTC) i zakłada sesję u YouTube.
3. **Chunky po 16 MiB** (tzw. chunked upload) — plik leci kawałkami (`content-range`); Worker przepycha strumień dalej do YouTube. Wideo **nie ma twardego timeoutu** — duży plik na wolnym łączu po prostu leci dłużej, z progresem procentowym.
4. **Post** — referencje wpadają do JSONB w tabeli postów (max 5 na post, tytuł do 100 znaków).

## Limit 2 GiB

Pojedyncze wideo nie może przekroczyć 2 GiB — start uploadu z większym plikiem kończy się kodem 413 i czytelnym komunikatem.

## Odtwarzacz

Posty osadzają YouTube przez **własny player** na IFrame Player API, a nie goły iframe:

- biblioteka YT ładuje się leniwie, raz na całą apkę
- klik na powierzchni filmu gra/pauzuje; pasek postępu i pełny ekran są własne (iOS nie wspiera natywnego fullscreen w iframe — dlatego pełny ekran robi CSS)
- interfejs YouTube (paski, logo-overlay) jest zasłonięty, po zakończeniu filmu widać ostatnią klatkę z „Odtwórz ponownie"

## Czego tu nie ma

- **Nie ma wklejania linków YouTube** — jedyna droga wideo do posta to upload admina przez OAuth.
- Upload wideo jest **zabiegiem admina** (middleware admin + połączone konto YouTube) — członkowie rodziny wideo tylko oglądają.
- Nie ma backupu wideo u nas — YouTube jest miejscem przechowywania; usunięcie filmu na YouTube znaczy, że w poście zostaje martwa referencja.

> **Uwaga:** unlisted na YouTube = film nie jest publicznie wyszukiwalny, ale każdy z linkiem może go obejrzeć. Dlatego posty z wideo udostępnia się tylko przez Wspólniaka.
