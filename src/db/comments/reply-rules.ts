// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Reguły odpowiedzi na komentarze — plik lekki, bez drizzle (issue #239).
 * Serwer egzekwuje limit w API (hono/api/comments), klient w UI (comment-item).
 */
export const MAX_REPLIES_PER_COMMENT = 5;

/** Czy można dodać kolejne reply, given bieżąca liczba reply pod komentarzem. */
export function canAddReply(currentReplyCount: number): boolean {
	return currentReplyCount < MAX_REPLIES_PER_COMMENT;
}
