// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Potok propose-post-description (F3 #190) — deep module: na wejściu klucz
 * Groq i data URL zdjęcia, na wyjściu finalny polski opis posta. Chowa w
 * środku: wywołanie vision (id z models.ts), czyszczenie sceny z tagów
 * <think> (qwen3.8 myśli tagami), strażnika pustej sceny i wywołanie polish
 * (gpt-oss-120b). Scena jest intermediarzem — nigdy nie wychodzi z serwera
 * jako osobna odpowiedź.
 */

import {
	GENERATION_MODEL_ID,
	polishPostDescriptionMessages,
	proposePostDescriptionVisionMessages,
} from "./generation-prompts";
import { completeChat, GroqError } from "./groq";
import { VISION_MODEL_ID } from "./models";
import { ThinkParser } from "./think-parser";

/**
 * Krok 1 (vision, VISION_MODEL_ID) → krok 2 (polish, GENERATION_MODEL_ID).
 * Pusta scena (model vision nic nie opisał) to błąd techniczny — GroqError
 * z 502, żeby endpoint zmapował go na polski komunikat „AL ma teraz problemy
 * techniczne…". Obraz leci wyłącznie do kroku 1; krok 2 dostaje sam tekst.
 */
export async function proposePostDescription(apiKey: string, image: string): Promise<string> {
	const parser = new ThinkParser();
	const rawScene = await completeChat({
		apiKey,
		model: VISION_MODEL_ID,
		messages: proposePostDescriptionVisionMessages(image),
	});
	const tokens = [...parser.push(rawScene), ...parser.flush()];
	const scene = tokens
		.map((token) => (token.kind === "text" ? token.text : ""))
		.join("")
		.trim();
	if (scene.length === 0) {
		throw new GroqError("pusta scena", 502);
	}
	return completeChat({
		apiKey,
		model: GENERATION_MODEL_ID,
		messages: polishPostDescriptionMessages(scene),
	});
}
