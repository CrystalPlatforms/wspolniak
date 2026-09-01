// SPDX-License-Identifier: AGPL-3.0-or-later
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { DEFAULT_MODEL_ID } from "./models";
import { type ChatToken, decodeTokenLine, type PostPreview } from "./stream-protocol";

export interface UiChatMessage {
	role: "user" | "assistant";
	content: string;
	/** Myślenie modelu reasoningowego — podglądane w bańce, nie leci do API. */
	reasoning?: string;
	/** Posty dopasowane przez search-before-answer (F5) — karty pod odpowiedzią. */
	matchedPosts?: PostPreview[];
}

/** Wiadomość w formacie API — wyłącznie role + content (reasoning/posts nie wraca). */
export interface ApiChatMessage {
	role: "user" | "assistant";
	content: string;
}

/**
 * Błąd odpowiedzi serwera (4xx/5xx) — komunikat z payloadu jest już po polsku
 * i przeznaczony do wyświetlenia wprost (bez wrappera „[Błąd: …]").
 */
export class ChatRequestError extends Error {
	constructor(
		message: string,
		public readonly status: number,
	) {
		super(message);
		this.name = "ChatRequestError";
	}
}

export const STORAGE_KEY = "wspolniak-ai-chat";
export const MAX_PERSISTED_MESSAGES = 100;

/**
 * Stan czatu AL (F3 #181): wiadomości + streaming z POST /api/ai/chat.
 * Konwersacja jest trwała per urządzenie (localStorage, ostatnie 100
 * wiadomości). Model jest jeden po stronie serwera — klient wysyła
 * wyłącznie historię. Identyfikator strumienia chroni przed sytuacją,
 * w której stary reader dopisywałby tokeny po zmianie stanu.
 */
export function useAiChat() {
	const [messages, setMessages] = useState<UiChatMessage[]>(loadStoredMessages);
	const [isStreaming, setIsStreaming] = useState(false);
	const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
	const [isSearching, setIsSearching] = useState(false);
	const streamIdRef = useRef(0);
	const abortRef = useRef<AbortController | null>(null);

	// Zapis per urządzenie: każda zmiana konwersacji ląduje w localStorage
	// (bez tego nic nie przetrwa odświeżenia strony).
	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			if (messages.length === 0) {
				window.localStorage.removeItem(STORAGE_KEY);
			} else {
				window.localStorage.setItem(
					STORAGE_KEY,
					JSON.stringify(messages.slice(-MAX_PERSISTED_MESSAGES)),
				);
			}
		} catch {
			// localStorage niedostępny (tryb prywatny, quota) — czat działa w pamięci
		}
	}, [messages]);

	/** Przerywa generowanie: reader rzuci AbortError, treść zostaje jak jest
	 *  (pusta odpowiedź jest usuwana, żeby nie wisiała martwa bańka). */
	const stop = () => {
		abortRef.current?.abort();
	};

	/** Nowa rozmowa: czyści stan i zapiski w localStorage (efekt usuwa klucz). */
	const clearConversation = () => {
		setMessages([]);
	};

	const send = async (text: string) => {
		const trimmed = text.trim();
		if (!trimmed || isStreaming) return;

		const streamId = ++streamIdRef.current;
		const history: UiChatMessage[] = [...messages, { role: "user", content: trimmed }];
		setMessages([...history, { role: "assistant", content: "" }]);
		setIsStreaming(true);
		setIsSearching(true);

		try {
			const controller = new AbortController();
			abortRef.current = controller;
			const response = await fetch("/api/ai/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				// Reasoning nie wraca do API — historia niesie tylko role+content,
				// a model picker (F4) dokleja wybrany model.
				body: JSON.stringify({ messages: toApiMessages(history), model: modelId }),
				signal: controller.signal,
			});
			if (!response.ok || !response.body) {
				const error = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new ChatRequestError(
					error?.error ?? `Błąd serwera (${response.status})`,
					response.status,
				);
			}

			await pumpChatStream(response.body, (token) => {
				if (streamIdRef.current === streamId) {
					// Znacznik "searching" włącza fazę szukania (po myśleniu);
					// treść/myślenie ją zamykają.
					if (token.kind === "searching") {
						setIsSearching(true);
						return;
					}
					setIsSearching(false);
					setMessages((prev) => appendTokenToAssistant(prev, token));
				}
			});
		} catch (error) {
			finishOnFailure(error, streamId, streamIdRef, setMessages);
		} finally {
			if (streamIdRef.current === streamId) {
				setIsStreaming(false);
				setIsSearching(false);
			}
		}
	};

	return {
		messages,
		send,
		stop,
		isStreaming,
		isSearching,
		clearConversation,
		modelId,
		setModelId,
	};
}

/** Historia UI → payload API: bezwyjątkowo role+content, reasoning odpada. */
export function toApiMessages(history: UiChatMessage[]): ApiChatMessage[] {
	return history.map(({ role, content }) => ({ role, content }));
}

/** Dane z localStorage (dowolny JSON) → bezpieczna lista ostatnich 100 wiadomości. */
export function sanitizeStoredMessages(parsed: unknown): UiChatMessage[] {
	if (!Array.isArray(parsed)) return [];
	const valid = parsed.filter((entry): entry is UiChatMessage => {
		if (typeof entry !== "object" || entry === null) return false;
		const candidate = entry as Partial<UiChatMessage>;
		return (
			(candidate.role === "user" || candidate.role === "assistant") &&
			typeof candidate.content === "string" &&
			candidate.content.length > 0
		);
	});
	const safe = valid.map((entry) => ({
		...entry,
		matchedPosts: Array.isArray(entry.matchedPosts) ? entry.matchedPosts : undefined,
	}));
	return safe.slice(-MAX_PERSISTED_MESSAGES);
}

/** Leniwa inicjalizacja stanu z localStorage — uszkodzony JSON = pusta rozmowa. */
function loadStoredMessages(): UiChatMessage[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		return sanitizeStoredMessages(JSON.parse(raw));
	} catch {
		return [];
	}
}

/** Updater setMessages: dopisuje token (treść/myślenie/posty) do ostatniej bańki. */
function appendTokenToAssistant(prev: UiChatMessage[], token: ChatToken): UiChatMessage[] {
	if (token.kind === "searching") return prev; // znacznik fazy, nie treść bańki
	const last = prev.at(-1);
	if (last?.role !== "assistant") return prev;
	const next = [...prev];
	next[next.length - 1] =
		token.kind === "posts"
			? { ...last, matchedPosts: token.posts }
			: token.kind === "reasoning"
				? { ...last, reasoning: (last.reasoning ?? "") + token.text }
				: { ...last, content: last.content + token.text };
	return next;
}

/** Updater setMessages: usuwa ostatnią bańkę asystenta, gdy zupełnie pusta (abort). */
function dropEmptyAssistant(prev: UiChatMessage[]): UiChatMessage[] {
	const last = prev.at(-1);
	if (last?.role === "assistant" && last.content === "" && !last.reasoning && !last.matchedPosts) {
		return prev.slice(0, -1);
	}
	return prev;
}

/** Updater setMessages: wpisuje komunikat błądu do ostatniej bańki asystenta. */
function markAssistantError(prev: UiChatMessage[], message: string, raw = false): UiChatMessage[] {
	const last = prev.at(-1);
	if (last?.role !== "assistant") return prev;
	const next = [...prev];
	next[next.length - 1] = {
		role: "assistant",
		content: raw ? message : `[Błąd: ${message}]`,
	};
	return next;
}

/**
 * Domyka ostatnią bańkę po błędzie: abort usuwa pustą odpowiedź (samo
 * myślenie zostaje — da się je podejrzeć), inny błąd wpisuje [Błąd: …].
 */
function finishOnFailure(
	error: unknown,
	streamId: number,
	streamIdRef: { current: number },
	setMessages: Dispatch<SetStateAction<UiChatMessage[]>>,
): void {
	if (error instanceof DOMException && error.name === "AbortError") {
		if (streamIdRef.current !== streamId) return;
		setMessages(dropEmptyAssistant);
		return;
	}
	if (streamIdRef.current !== streamId) return;
	const message = error instanceof Error ? error.message : "Nieznany błąd";
	setMessages((prev) => markAssistantError(prev, message, error instanceof ChatRequestError));
}

/**
 * Czyta strumień NDJSON odpowiedzi (linia = token: treść albo myślenie),
 * buforując linie cięte między chunkami. Serwer już rozdziela myślenie
 * (<think>) od treści — klient przepuszcza linie bez dalszego parsowania.
 */
async function pumpChatStream(
	body: ReadableStream<Uint8Array>,
	onToken: (token: ChatToken) => void,
): Promise<void> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	const consume = (chunk: string) => {
		buffer += chunk;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			const token = decodeTokenLine(line);
			if (token) onToken(token);
		}
	};

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		consume(decoder.decode(value, { stream: true }));
	}
	const token = decodeTokenLine(buffer);
	if (token) onToken(token);
}
