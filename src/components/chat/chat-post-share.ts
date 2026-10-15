// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ChatPostPreview } from "@/components/chat/chat-api";

/** Współdzielony klucz zapytania o podgląd draftu posta (composer, F5 #218). */
export function chatPostPreviewKey(postId: string): readonly [string, string, string] {
	return ["chat", "share-preview", postId];
}

/**
 * Podgląd posta dla draftu (F5 #218). 404 = post usunięty/nieistniejący —
 * zwracamy `null`, żeby composer mógł zrzucić draft (zamiast wysypywać czat).
 */
export async function fetchChatPostPreview(postId: string): Promise<ChatPostPreview | null> {
	const res = await fetch(`/api/chat/share-preview/${postId}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error("Nie udało się pobrać podglądu posta");
	const json = (await res.json()) as { data: ChatPostPreview };
	return json.data;
}
