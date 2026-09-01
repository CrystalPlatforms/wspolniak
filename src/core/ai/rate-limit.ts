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

/** Limit przeszukiwania postów (router TAK) — raz na minutę per user. */
const searchWindows = new Map<string, WindowEntry>();

/** Czy user może w tej minucie przeszukać posty; jeżeli tak — zużywa limit. */
export function consumeAiPostSearch(userId: string): boolean {
	const now = Date.now();
	const entry = searchWindows.get(userId);
	if (!entry || entry.expiresAt <= now) {
		searchWindows.set(userId, { count: 1, expiresAt: now + WINDOW_MS });
		return true;
	}
	return false;
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

/** Izolacja stanu między testami — wołane wyłącznie z testów endpointu. */
export function resetAiRateLimitsForTests(): void {
	windows.clear();
	searchWindows.clear();
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
