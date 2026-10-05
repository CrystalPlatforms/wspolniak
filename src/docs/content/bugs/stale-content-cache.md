---
title: Aplikacja pokazuje stare treści
---

## Objaw

Po aktualizacji Wspólniaka widać starą wersję: brak nowych przycisków, stary wygląd, albo apka uparcie pokazuje ten sam feed mimo dodania nowych postów. Czasem starsze urządzenie w rodzinie „utknęło" na poprzedniej wersji, a reszta rodziny widzi nową.

## Przyczyna

Apka trzyma **cache service workera** — powłokę aplikacji i statyczne pliki (JS, CSS, obrazy) zapisuje na urządzeniu, żeby offline apka w ogóle się uruchamiała. Strategia dla assetów to „cache-first", więc dopóki cache żyje, przeglądarka korzysta z lokalnych plików. Nowy deploy tworzy nowy cache i sprząta stary, ale urządzenie musi **raz pobiec do sieci**, żeby to zauważyć — urządzenie, które dawno nie było online (albo było w trybie oszczędzania), pokazuje to, co ma w pamięci.

## Rozwiązanie

1. **Odśwież stronę** (pociągnij w dół / F5) — strony ładują się „network-first", więc zwykłe odświeżenie zwykle wystarcza.
2. Jeśli to nie pomogło: **zamknij wszystkie karty apki** i otwórz ponownie — nowy service worker przejmie kontrolę i podmieni cache.
3. W ostateczności wyczyść dane strony (ustawienia przeglądarki → witryny → Wspólniak → wyczyść dane) — apka odbuduje cache od zera.
4. Urządzenie musi być **online**, żeby podnieść nową wersję — apka offline nigdy nie zaktualizuje się sama.

> **Uwaga:** to nie błąd, tylko mechanizm trybu offline — ten sam cache, który pokazuje ostatni feed bez internetu, jest źródłem „starych treści", gdy urządzenie nie złapie nowej wersji.
