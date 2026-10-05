---
title: Czat nie pokazuje wiadomości
---

## Objaw

Czat wygląda na pusty albo brakuje wiadomości, które „były". Ktoś napisał rano, a po południu wiadomości nie ma.

## Przyczyna

**Okno 24 godzin** — wiadomości czatu żyją dokładnie dobę od wysłania, po czym znikają (tak ma być; szczegóły w artykule technicznym o czacie). Poza tym zerwane połączenie: apka łączy się na żywo (WebSocket), a po utracie internetu odbudowuje połączenie z rosnącymi odstępami — przez te chwilę nowe wiadomości mogą nie wchodzić.

## Rozwiązanie

1. Sprawdź, czy nie widać czerwonego paska „Brak połączenia" — jeśli jest, poczekaj chwilę albo przełącz się na lepsze łącze; apka sama się podłączy.
2. **Odśwież stronę** — apka pobierze na żywo to, co jest teraz w oknie 24 h.
3. Pamiętaj o oknie 24 h: starsze wiadomości **celowo znikają**. Coś ważnego? Przenieś to do posta — posty nie wygasają.

> **Uwaga:** bezpośrednie odpowiedzi (reply z cytatem) przetrwają wygaśnięcie oryginału — cytat jest zapamiętywany w chwili odpowiedzi, więc kontekst rozmowy nie znika bez śladu.
