// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ChatLocationInput } from "@/components/chat/chat-input";
import type { AttachmentMeta } from "@/db/chat";
import type { ChatMessageKind } from "@/db/chat/schema";

/** Współdzielony klucz zapytania o listę wiadomości czatu. */
export const CHAT_MESSAGES_KEY = ["chat", "messages"] as const;

/** Karta udostępnionego posta (F5 #218) — kształt doklejany przez API do wiadomości kind='post'. */
export interface ChatPostPreview {
	id: string;
	snippet: string;
	authorName: string;
	/** Miniatura: zdjęcie z Cloudflare Images albo poster z YouTube; null = post bez mediów. */
	thumbnailUrl: string | null;
}

/** Wiadomość czatu po stronie klienta — daty przychodzą z API jako ISO string (JSON).
 *  `payload` to surowy JSON z API (kształt zależny od `kind`); parsuje go
 *  defensywnie komponent bąbelka (np. parsePollPayload). Dla kind='post' API
 *  dokleja `post` (null = post usunięty/nieistniejący → placeholder karty). */
export interface ChatMessageItem {
	id: string;
	authorId: string;
	text: string;
	kind: ChatMessageKind;
	payload: unknown;
	post?: ChatPostPreview | null;
	replyToId: string | null;
	replyText: string | null;
	createdAt: string;
	expiresAt: string;
	author: { id: string; name: string };
}

export async function fetchChatMessages(): Promise<ChatMessageItem[]> {
	const res = await fetch("/api/chat/messages");
	if (!res.ok) throw new Error("Nie udało się pobrać wiadomości");
	const json = (await res.json()) as { data: ChatMessageItem[] };
	return json.data;
}

export async function sendChatMessage(text: string, replyToId?: string): Promise<ChatMessageItem> {
	const res = await fetch("/api/chat/messages", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ text, replyToId }),
	});
	if (!res.ok) throw new Error("Nie udało się wysłać wiadomości");
	const json = (await res.json()) as { data: ChatMessageItem };
	return json.data;
}

/** Ankieta (F2 #215): ta sama ścieżka POST, union po `kind`. */
export async function sendChatPoll(question: string, options: string[]): Promise<ChatMessageItem> {
	const res = await fetch("/api/chat/messages", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ kind: "poll", text: question, payload: { options } }),
	});
	if (!res.ok) throw new Error("Nie udało się wysłać ankiety");
	const json = (await res.json()) as { data: ChatMessageItem };
	return json.data;
}

/** Lokalizacja (F3 #216): `text` = etykieta albo domyślny opis (kolumna NOT NULL). */
export async function sendChatLocation(input: ChatLocationInput): Promise<ChatMessageItem> {
	const res = await fetch("/api/chat/messages", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			kind: "location",
			text: input.label ?? "Udostępniono lokalizację",
			payload: { lat: input.lat, lng: input.lng, ...(input.label ? { label: input.label } : {}) },
		}),
	});
	if (!res.ok) throw new Error("Nie udało się wysłać lokalizacji");
	const json = (await res.json()) as { data: ChatMessageItem };
	return json.data;
}

/**
 * Załączniki (F4 #217): pliki uploaduje `uploadChatAttachments` (multipart → R2),
 * stąd lecą już tylko metadane — tekst + załączniki to JEDNA wiadomość.
 */
export async function sendChatAttachments(
	text: string,
	attachments: AttachmentMeta[],
	replyToId?: string,
): Promise<ChatMessageItem> {
	const res = await fetch("/api/chat/messages", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			kind: "attachments",
			text,
			replyToId,
			payload: { attachments },
		}),
	});
	if (!res.ok) throw new Error("Nie udało się wysłać załączników");
	const json = (await res.json()) as { data: ChatMessageItem };
	return json.data;
}

/** Udostępnienie posta (F5 #218): payload niesie samo id — kartę resolwuje serwer. */
export async function sendChatPost(
	postId: string,
	text: string,
	replyToId?: string,
): Promise<ChatMessageItem> {
	const res = await fetch("/api/chat/messages", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ kind: "post", text, replyToId, payload: { postId } }),
	});
	if (!res.ok) throw new Error("Nie udało się wysłać posta");
	const json = (await res.json()) as { data: ChatMessageItem };
	return json.data;
}

export async function deleteChatMessageRequest(messageId: string): Promise<void> {
	const res = await fetch(`/api/chat/messages/${messageId}`, { method: "DELETE" });
	if (!res.ok) throw new Error("Nie udało się usunąć wiadomości");
}
