---
title: AL pod maską
---

AL to asystent AI rodziny, działający na modelach **Groq**. Oto jak jest zbudowany od środka — od promptu po limity.

## Kim jest AL

Prompt systemowy składa się z trzech warstw:

1. **Persona** — polski, bez emoji i tabel, z twardą regułą „nie zmyślaj".
2. **Kuratorowana wiedza** — opis stacka i funkcji Wspólniaka zapisany w kodzie.
3. **Docsy (RAG-lite)** — przed odpowiedzią serwer przeszukuje dokumentację (to samo wyszukiwanie co na docsach: trafienie w tytule +10, w treści +1, bez polskich znaków) i dokleja do 3 najlepiej pasujących fragmentów (każdy ≤700 znaków, score min. 6) z linkami do artykułów.
4. **Posty z feedu** — po wyszukaniu AL widzi do 15 postów (zależnie od modelu) z opisami przyciętymi do 240 znaków.

## Modele

Trzy profile do wyboru (prawdziwe id modeli nie są pokazywane w UI):

| Profil | Model | Posty w kontekście | Limit |
| --- | --- | --- | --- |
| AL Max | `gpt-oss-120b` (reasoning wysoki) | 15 | 1/min |
| AL Pro | `qwen3.8-27b` | 10 | 2/min |
| AL Lite (domyślny) | `gpt-oss-20b` (wersja okrojona) | 8 | 5/min |

Limity są per użytkownik **i model** (okno 60 s) — wyczerpany Max nie blokuje Lite.

## Widzenie obrazów

Jedyny model przyjmujący obrazy na tym koncie to `qwen3.8-27b` — używa go proponowanie opisu posta: obraz (data URL do ~3 MB po zmniejszeniu po stronie klienta) opisuje scena, potem drugi model doszlifowuje tekst. Przebiegi rozumowania (`<think>`) są wyłapywane i oddzielane od odpowiedzi.

## Streaming i szukanie

Odpowiedź leci strumieniowo jako NDJSON: tokeny tekstu, rozumowania i wyników szukania postów. Szukanie po feedzie rusza na twarde wyzwalacze („poszukaj…", „pokaż posty…") — limitem 6 zapytań na minutę.

## Bramki dostępu

Dostęp do AL to trzy kolejne furtki: flaga admina (włącznik funkcji) → użytkownik nieblokowany → **zgoda użytkownika (opt-in)**. Bez któregokolwiek — 403 po polsku.

> **Uwaga:** do generowania jednorazowych treści (popraw opis, tytuł albumu) służy osobny endpoint; tytuły albumów powstają wyłącznie z metadanych plików — bajty zdjęć tam nie lecą.
