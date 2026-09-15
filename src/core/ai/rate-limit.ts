// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Rate limiting AL (F4 #182) — per user i per model, stałe okno 60 s.
 * Limity czytane z AI_MODELS (3/4/7 odp./min). Stan to Map w pamięci
 * isolate'a Workera — restart resetuje licznik; dla aplikacji rodzinnej
 * wystarczające (ten sam wzorzec co middleware rate-limit dla /share).
 * Klucz uwzględnia model: wyczerpany limit AL Max nie blokuje AL Lite.
 */

import { AI_MODELS } from "./models";

const WINDOW_MS = 60_000;

interface WindowEntry {
	count: number;
	expiresAt: number;
}

const windows = new Map<string, WindowEntry>();

export interface AiRateLimitResult {
	allowed: boolean;
	/** Kiedy okno wygasa i model znów odpowie (ISO) — tylko przy blokadzie. */
	resetAt?: string;
}

/**
 * Limit przeszukiwania postów (router TAK) — 6 na minutę per user. Szukanie to
 * tanie zapytanie do bazy (bez tokenów Groqa), więc limitem chronimy tylko
 * przed spamem, nie przed TPM — dawniej 1/min zdążało zepsuć drugie pytanie.
 */
const SEARCH_LIMIT_PER_MINUTE = 6;
const searchWindows = new Map<string, WindowEntry>();

/** Czy user może w tej minucie przeszukać posty; jeżeli tak — zużywa limit. */
export function consumeAiPostSearch(userId: string): boolean {
	const now = Date.now();
	const entry = searchWindows.get(userId);
	if (!entry || entry.expiresAt <= now) {
		searchWindows.set(userId, { count: 1, expiresAt: now + WINDOW_MS });
		return true;
	}
	if (entry.count >= SEARCH_LIMIT_PER_MINUTE) return false;
	entry.count += 1;
	return true;
}

/** Rejestruje jedną odpowiedź; blokadę sygnalizuje razem z czasem resetu. */
export function consumeAiRateLimit(userId: string, modelId: string): AiRateLimitResult {
	const limit = AI_MODELS.find((model) => model.id === modelId)?.perMinuteLimit ?? 3;
	const key = `${userId}:${modelId}`;
	const now = Date.now();
	const entry = windows.get(key);

	// Brak wpisu albo przeterminowany = świeże okno.
	if (!entry || entry.expiresAt <= now) {
		windows.set(key, { count: 1, expiresAt: now + WINDOW_MS });
		return { allowed: true };
	}
	if (entry.count >= limit) {
		return { allowed: false, resetAt: new Date(entry.expiresAt).toISOString() };
	}
	entry.count += 1;
	return { allowed: true };
}

/**
 * Limit generowania AL v2 (F1 #188) — osobne okno per user, niezależne od
 * czatu. Wstępnie 4/min: wywołanie generowania jest małe (persona + tekst
 * opisu, bez wstrzykiwania postów) — ok. 1,5-2k tokenów z odpowiedzią na
 * 8k TPM gpt-oss-120b (darmowy tier), z zapasem na czat w tej samej
 * organizacji. Wartość początkową zatwierdza owner w HITL (issue #188).
 */
const GENERATION_LIMIT_PER_MINUTE = 4;
const generationWindows = new Map<string, WindowEntry>();

/** Czy user może w tej minucie wygenerować; jeżeli tak — zużywa limit. */
export function consumeAiGeneration(userId: string): AiRateLimitResult {
	const now = Date.now();
	const entry = generationWindows.get(userId);
	if (!entry || entry.expiresAt <= now) {
		generationWindows.set(userId, { count: 1, expiresAt: now + WINDOW_MS });
		return { allowed: true };
	}
	if (entry.count >= GENERATION_LIMIT_PER_MINUTE) {
		return { allowed: false, resetAt: new Date(entry.expiresAt).toISOString() };
	}
	entry.count += 1;
	return { allowed: true };
}

/** Polski komunikat 429 dla generowania — analogia do aiRateLimitMessage. */
export function aiGenerationRateLimitMessage(resetAt: string): string {
	const time = new Date(resetAt).toLocaleTimeString("pl-PL", {
		timeZone: "Europe/Warsaw",
		hour: "2-digit",
		minute: "2-digit",
	});
	return `Limit generowania na tę minutę został wykorzystany. Spróbuj ponownie o ${time}.`;
}

/** Izolacja stanu między testami — wołane wyłącznie z testów endpointu. */
export function resetAiRateLimitsForTests(): void {
	windows.clear();
	searchWindows.clear();
	generationWindows.clear();
}

/** Polski komunikat 429 bez emoji, z godziną dostępności (Europa/Warszawa). */
export function aiRateLimitMessage(uiName: string, resetAt: string): string {
	const time = new Date(resetAt).toLocaleTimeString("pl-PL", {
		timeZone: "Europe/Warsaw",
		hour: "2-digit",
		minute: "2-digit",
	});
	return `Limit odpowiedzi dla modelu ${uiName} na tę minutę został wykorzystany. Model będzie dostępny ponownie o ${time}.`;
}
