// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Source of truth modeli AL (PRD #178, F2 #180). Jedyne miejsce z id Groqa,
 * nazwami UI, badge'ami, profilami reasoningu, liczbą wstrzykiwanych postów
 * i limitami per-minute. Id zweryfikowane na żywo endpointem models 2026-09-01
 * (wszystkie trzy obecne); Qwen: dostępne są i 3.6, i 3.8 — stakeholder wybrał
 * qwen3.8-27b (nowszy).
 *
 * Limity (2026-09-01, fazy: myślenie+szukanie+odpowiedź = 2 wywołania Groq
 * na wiadomość) dobrane pod TPM darmowego tieru Groqa, żeby nasze per-user
 * limity odpalały się ZANIM Groq odrzuci żądanie: gpt-oss-120b ma 8000 TPM,
 * a para wywołań z wiedzą+postami to ~5-6k tokenów (stąd Max 1/min). Lite
 * (8 postów od 2026-09-05, myślenie zredukowane) dostaje 5/min — domyślny wybór.
 * Prawdziwe nazwy/id modeli NIE są pokazywane w UI — picker mówi tylko AL Max/Pro/Lite.
 */

export interface AiModel {
	/** Dokładny id modelu Groq. */
	id: string;
	/** Nazwa w UI — jedyna nazwa widoczna dla usera (picker nie pokazuje id). */
	uiName: string;
	/** Badge w pickerze (F4); undefined = bez badge'a. */
	badge?: string;
	/**
	 * Profil reasoningu: „high" = pełne myślenie + preview, „on" = myślenie,
	 * „trimmed" = zredukowane i niewyświetlane.
	 */
	reasoning: "high" | "on" | "trimmed";
	/** Ile postów wstrzykiwać do system promptu (konsumowane od F5). */
	injectedPostCount: number;
	/** Limit odpowiedzi per user per minuta (konsumowane od F4). */
	perMinuteLimit: number;
	/** Model domyślny — AL Lite (najlżejszy, najszerszy limit TPM). */
	isDefault: boolean;
}

export const AI_MODELS: AiModel[] = [
	{
		id: "openai/gpt-oss-120b",
		uiName: "AL Max",
		badge: "Głęboko Myślący",
		reasoning: "high",
		injectedPostCount: 15,
		perMinuteLimit: 1,
		isDefault: false,
	},
	{
		id: "qwen/qwen3.8-27b",
		uiName: "AL Pro",
		badge: "Myślący",
		reasoning: "on",
		injectedPostCount: 10,
		perMinuteLimit: 2,
		isDefault: false,
	},
	{
		id: "openai/gpt-oss-20b",
		uiName: "AL Lite",
		reasoning: "trimmed",
		// Lite = model „codzienny": najtańszy profil i najszerszy limit, żeby
		// domyślny wybór nie trzaskał 429. 8 postów (było 3): przy 3 AL Regularnie
		// odpowiadał, że „nic nie znalazł", mimo że szukanie trafiało.
		injectedPostCount: 8,
		perMinuteLimit: 5,
		isDefault: true,
	},
];

export const DEFAULT_MODEL_ID = "openai/gpt-oss-20b";

/**
 * Model vision AL v2 (F3 #190) — id zweryfikowane NA ŻYWO 2026-09-20: llama-4
 * scout/maverick usunięte z Groqa (sonda: model_not_found), `groq/compound`
 * zablokowany na poziomie projektu; jedyny model przyjmujący obrazy na tym
 * koncie to qwen3.8-27b (sonda: 32×32 px PNG → „Czerwony"). To ten sam model co
 * AL Pro w czacie; finalna akceptacja = HITL z prawdziwym zdjęciem.
 */
export const VISION_MODEL_ID = "qwen/qwen3.8-27b";

/**
 * Twardy sufit rozmiaru obrazu w żądaniu propose (F3 #190): Groq ogranicza obraz
 * do 4 MB po base64 → data URL ≤ 4 000 000 znaków (klient i tak pomniejsza
 * zdjęcie do ~2,8 MB surowych bajtów przed wysłaniem).
 */
export const VISION_IMAGE_MAX_CHARS = 4_000_000;

/**
 * Cel pomniejszenia zdjęcia u klienta przed wysłaniem do vision (F3 #190):
 * ~3 MB surowych bajtów → ~4 MB base64, w granicach VISION_IMAGE_MAX_CHARS.
 */
export const VISION_SHRINK_TARGET_BYTES = 3_000_000;

/** Id → definicja modelu; undefined dla obcego id (klient nie wybiera dowolnie). */
export function getModelById(id: string): AiModel | undefined {
	return AI_MODELS.find((model) => model.id === id);
}
