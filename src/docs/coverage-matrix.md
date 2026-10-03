<!-- Feature-coverage matrix (F8 #211, PRD #202 story 2/18). Każda funkcja
Wspólniaka → przynajmniej jeden dokument. Referencje `dzial/slug` muszą
istnieć w registry — pilnuje tego test coverage.test.ts obok registry. -->

# Matrix pokrycia funkcji dokumentacją

| #   | Funkcja                                                     | Dokumenty                                |
| --- | ----------------------------------------------------------- | ---------------------------------------- |
| 1   | Feed i posty (tekst, zdjęcia, wzmianki, szukanie)           | product/feed-and-posts                   |
| 2   | Edytor WYSIWYG / Markdown w postach                         | product/feed-and-posts                   |
| 3   | Reakcje emoji (posty i komentarze, „kto zareagował")        | product/reactions-comments               |
| 4   | Komentarze (odpowiedzi, wzmianki, edycja)                   | product/reactions-comments               |
| 5   | Przypinanie postów                                          | product/feed-and-posts                   |
| 6   | Czat rodzinny 24 h (wzmianki, odpowiedzi, reakcje)          | product/family-chat                      |
| 7   | Wideo YouTube (Wspólniak Wideo)                             | product/videos, product/uploading-photos |
| 8   | Albumy (okładka, elementy, pobieranie ZIP)                  | product/albums                           |
| 9   | Biblioteka (prywatne zakładki postów)                       | product/library                          |
| 10  | Kalendarz (wzorce roczne, przypomnienia D-0/D-7)            | product/calendar                         |
| 11  | Upload zdjęć (limity, zmniejszanie, wolne łącze, HEIC)      | product/uploading-photos                 |
| 12  | Powiadomienia push                                          | product/notifications-and-pwa            |
| 13  | PWA — instalacja i tryb offline                             | product/notifications-and-pwa            |
| 14  | Logowanie magic linkami (+ /share z kodem dostępu)          | product/logging-in                       |
| 15  | AL — asystent AI (modele, szukanie postów, pomoc w pisaniu) | product/al-assistant                     |
| 16  | Admin — panel, członkowie, tryb awaryjny, YouTube           | product/for-admins                       |
| 17  | Admin — statystyki i ranking rodziny                        | product/for-admins                       |
| 18  | Przełączniki funkcji on/off                                 | product/for-admins                       |
| 19  | Udostępnianie treści rodzinie (pobieranie ZIP, kod dostępu) | product/albums, product/logging-in       |
