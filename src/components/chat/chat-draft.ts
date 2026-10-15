// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Draft przenoszony przez URL do trasy czatu (F5 #218; mostek kalendarza #219):
 * - `post:<id>` — udostępnienie posta (podgląd w composerze, wysyłka ręczna),
 * - `text:<encodeURIComponent(tekst)>` — gotowy tekst do pola wiadomości
 *   (szablon „Zaproponuj datę").
 * Jeden parametr `draft`; mechanizm tekstowy reużyje potem Chat F6.
 */

export type ChatDraft = { type: "post"; postId: string } | { type: "text"; text: string };

const POST_PREFIX = "post:";
const TEXT_PREFIX = "text:";
/** Twardy sufit na zakodowany parametr (200 znaków tekstu × 9 po encodeURIComponent + zapas). */
const MAX_DRAFT_PARAM_LENGTH = 2000;
/** Tekstowy draft obcina się do limitu wiadomości czatu (200 znaków). */
const MAX_DRAFT_TEXT_LENGTH = 200;

/** Post-id składa się tylko ze znaków UUID/znaków alfanumerycznych — odcina śmieci z URL. */
const POST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function encodeChatDraft(draft: ChatDraft): string {
	if (draft.type === "post") return `${POST_PREFIX}${draft.postId}`;
	return `${TEXT_PREFIX}${encodeURIComponent(draft.text)}`;
}

/**
 * Parsuje parametr `draft` z URL — niepoprawny/obcy format daje `null`
 * (trasa ignoruje draft zamiast się wysypać).
 */
export function parseChatDraft(raw: string | undefined): ChatDraft | null {
	if (!raw || raw.length > MAX_DRAFT_PARAM_LENGTH) return null;
	if (raw.startsWith(POST_PREFIX)) {
		const postId = raw.slice(POST_PREFIX.length);
		return POST_ID_RE.test(postId) ? { type: "post", postId } : null;
	}
	if (raw.startsWith(TEXT_PREFIX)) {
		try {
			const text = decodeURIComponent(raw.slice(TEXT_PREFIX.length)).slice(
				0,
				MAX_DRAFT_TEXT_LENGTH,
			);
			return text.trim() ? { type: "text", text } : null;
		} catch {
			return null;
		}
	}
	return null;
}
