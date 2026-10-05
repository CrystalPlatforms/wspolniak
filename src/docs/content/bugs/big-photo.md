---
title: Zdjęcie przekracza dozwolony rozmiar pliku
---

## Objaw

Zdjęcie dodane do posta oznacza się na czerwono z wykrzyknikiem, a kliknięcie miniatury otwiera dialog **„Zdjęcie jest za duże"** z nazwą pliku, jego rzeczywistym rozmiarem i limitem 19 MB. Publikacja posta z tym zdjęciem jest zablokowana, dopóki plik nie zostanie zmniejszony albo wymieniony.

## Przyczyna

Aparaty w telefonach rejestrują zdjęcia w rozdzielczości 12–48 Mpx. Rozmiar wynikowego pliku zależy od aktywnego trybu aparatu:

| Tryb aparatu | Typowy rozmiar pliku | Status |
| --- | --- | --- |
| Standardowy (JPEG / HEIF) | 2–8 MB | w granicach limitu |
| Wysoka rozdzielczość (48/50 Mpx) | 8–20 MB | może przekraczać limit |
| Tryb nocny / HDR | 10–25 MB | może przekraczać limit |
| RAW / ProRAW / Expert RAW | 25–75 MB | powyżej limitu |

## Rozwiązanie — zmniejszenie w aplikacji

Aplikacja oferuje automatyczną redukcję rozmiaru pliku bez zmiany ustawień telefonu:

1. W widoku kompozytora kliknij miniaturę zdjęcia oznaczoną czerwoną flagą.
2. W oknie dialogowym „Zdjęcie jest za duże" wybierz **„Zmniejsz zdjęcie"**.
3. Po zakończeniu (kilka sekund) zdjęcie zastępuje oryginał, a publikacja przebiega normalnie.

> **Uwaga:** Redukcja rozmiaru wykonywana jest lokalnie na urządzeniu. Oryginalny plik na telefonie pozostaje bez zmian.

## Zapobieganie — konfiguracja aparatu (opcjonalna)

Aby telefon domyślnie zapisywał mniejsze pliki, zmień poniższe ustawienia:

### iPhone

- `Ustawienia → Aparat → Formaty → Wysoka wydajność` — format HEIF redukuje rozmiar pliku kilkukrotnie względem JPEG.
- `Ustawienia → Aparat → Formaty → ProRAW i kontrola rozdzielczości` — wyłącz ProRAW lub ustaw rozdzielczość standardową (12 Mpx).

### Google Pixel

- `Aparat → Ustawienia → Zapis RAW` — wyłącz.
- W trybie zdjęcia wybierz rozdzielczość `12 Mpx` zamiast pełnej.

### Samsung Galaxy

- `Aparat → Ustawienia → Rozmiar zdjęcia` — ustaw mniejszą rozdzielczość (np. 12 Mpx).
- Oddzielna aplikacja `Expert RAW` generuje pliki kilkukrotnie przekraczające limit — zalecany zwykły Aparat.

## Parametry techniczne

| Parametr | Wartość |
| --- | --- |
| Maksymalny rozmiar pliku | 19 MB |
| Obsługiwane formaty | JPEG, PNG, WebP, HEIC, HEIF |
| Maksymalna liczba zdjęć w poście | 10 |
| Przetwarzanie po stronie serwera | Cloudflare Images (automatyczne warianty rozmiarów) |

## Zobacz też

- [Upload trwa wieczność](/bugs/slow-upload) — gdy zdjęcie wlecze się przez wolne łącze
- [Dokumentacja techniczna: Upload zdjęć pod maską](/technical/photo-upload-pipeline) — jak działa zmniejszanie i wysyłka
