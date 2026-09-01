// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Efektywny dostęp do AL (Wspólniak AI, PRD #178) — jedna reguła obowiązująca
 * wszędzie: master flag instancji ORAZ user nieblokowany ORAZ user opt-in.
 * Czysta funkcja — używa jej gating endpointu /api/ai/chat, a od F6 także
 * wejścia do czatu (sidebar, przycisk w headerze).
 */
export interface AiAccessInput {
	/** Master switch admina (instance flag `ai`). */
	master: boolean;
	/** Blokada admina per user (`users.aiBlocked`). */
	aiBlocked: boolean;
	/** Opt-in usera z Ustawień (`users.aiOptIn`). */
	aiOptIn: boolean;
}

export function hasEffectiveAiAccess(input: AiAccessInput): boolean {
	return input.master && !input.aiBlocked && input.aiOptIn;
}
