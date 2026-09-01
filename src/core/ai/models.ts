// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Source of truth modeli AL (PRD #178, F2 #180). Jedyne miejsce z id Groqa,
 * nazwami UI, badge'ami, profilami reasoningu, liczbą wstrzykiwanych postów
 * i limitami per-minute. Id zweryfikowane na żywo endpointem models 2026-09-01
 * (wszystkie trzy obecne); Qwen: dostępne są i 3.6, i 3.8 — stakeholder wybrał
 * qwen3.8-27b (nowszy).
 */

export interface AiModel {
	/** Dokładny id modelu Groq. */
	id: string;
	/** Nazwa w UI. */
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
	/** Model domyślny (AL Max) — używany, dopóki nie ma pickera (F4). */
	isDefault: boolean;
}

export const AI_MODELS: AiModel[] = [
	{
		id: "openai/gpt-oss-120b",
		uiName: "AL Max",
		badge: "Głęboko Myślący",
		reasoning: "high",
		injectedPostCount: 15,
		perMinuteLimit: 3,
		isDefault: true,
	},
	{
		id: "qwen/qwen3.8-27b",
		uiName: "AL Pro",
		badge: "Myślący",
		reasoning: "on",
		injectedPostCount: 10,
		perMinuteLimit: 4,
		isDefault: false,
	},
	{
		id: "openai/gpt-oss-20b",
		uiName: "AL Lite",
		reasoning: "trimmed",
		injectedPostCount: 5,
		perMinuteLimit: 7,
		isDefault: false,
	},
];

export const DEFAULT_MODEL_ID = "openai/gpt-oss-120b";
