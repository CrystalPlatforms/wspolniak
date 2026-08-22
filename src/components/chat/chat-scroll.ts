// SPDX-License-Identifier: AGPL-3.0-or-later

/** Próg auto-scrolla od dna listy wiadomości (PRD: ~100px). */
const NEAR_BOTTOM_THRESHOLD_PX = 100;

/**
 * Czy użytkownik jest przy dnie listy (auto-scroll na nowe wiadomości)?
 * Bez elementu (np. pierwsze renderowanie) — true: bezpieczny fallback to
 * auto-scroll, żeby nigdy nie „zgubić” nadchodzących wiadomości.
 */
export function isNearBottom(
	element: HTMLElement | null,
	threshold = NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
	if (!element) return true;
	return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

/** Przewija listę na dół (smooth — Telegram-style). */
export function scrollToBottom(element: HTMLElement): void {
	element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
}
