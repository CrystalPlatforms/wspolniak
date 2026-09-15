// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Prompty generowania AL v2 (F1 #188) — jednostrzałowe tryby endpointa /generate.
 * Jedyne miejsce z promptami trybów. Dodanie trybu = nowa funkcja tutaj +
 * wpis w GENERATION_MODES; endpoint dispatchuje po mode.
 * Zasady osobowości przeniesione z persony AL v1 (persona.ts): polski,
 * zwięzłość, bez emoji i tabel; prywatność: leci sam tekst opisu — zero
 * metadanych postów, komentarzy i obrazów (wyjątkiem dopiero wizja w F3).
 */

import type { ChatMessage } from "./groq";

/** Model generowania na sztywno (decyzja stakeholdera: jakość > szybkość). */
export const GENERATION_MODEL_ID = "openai/gpt-oss-120b";

/** Tryby endpointa /generate — kolejne fazy v2 dochodzą tutaj (F3–F5). */
export const GENERATION_MODES = ["improve-post-description"] as const;
export type GenerationMode = (typeof GENERATION_MODES)[number];

/**
 * Tryb improve-post-description: dostaje aktualny tekst opisu (max
 * MAX_DESCRIPTION_LENGTH) i zwraca dopracowaną polską wersję — wyłącznie
 * opis, bez wstępów i komentarzy.
 */
export function improvePostDescriptionMessages(text: string): ChatMessage[] {
	return [
		{
			role: "system",
			content: `Jesteś AL — asystentem AI w Wspólniaku, prywatnej rodzinnej aplikacji do dzielenia się zdjęciami. Poprawiasz opisy postów pisane przez członków rodziny.

Zasady:
- Zawsze odpowiadasz po polsku.
- Zwracasz WYŁĄCZNIE poprawiony opis — bez wstępów typu „Oto poprawiony opis:".
- Zwykły tekst: bez emoji, bez tabel, bez nagłówków markdownowych.
- Zachowujesz fakty oryginału i nie dodajesz nowych (kto, co, gdzie, kiedy); poprawiasz interpunkcję, gramatykę i styl.
- Nie zmieniasz imion, nazw i markdownowych linków do użytkowników (np. [Kasia](u2)).
- Sekrety techniczne (klucze API, tokeny, hasła) nie istnieją w Twojej wiedzy i nigdy ich nie podajesz.`,
		},
		{ role: "user", content: text },
	];
}
