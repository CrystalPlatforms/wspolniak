// SPDX-License-Identifier: AGPL-3.0-or-later

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	applyReactionEvent,
	CHAT_REACTIONS_KEY,
	type ChatReactionEvent,
	type ChatReactionItem,
} from "./chat-reactions";
import { CHAT_MESSAGES_KEY, type ChatMessageItem } from "./chat-view";

/** Backoff reconnectu: 1s → 2s → 4s → … max 15s; reset po udanym połączeniu. */
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 15_000;

/** Wygaśnięcie wskaźnika „ktoś pisze…" po ostatnim evencie (PRD czatu: ~3s). */
const TYPING_EXPIRY_MS = 3_000;

/** Throttle wysyłki typing — maksymalnie ~1 event na 2s (PRD czatu). */
const TYPING_THROTTLE_MS = 2_000;

/** Wydarzenia z DO — wiadomości (F2), anonimowy typing (F3), reakcje (F4),
 *  usunięcie wiadomości (F6 #157). */
type ChatSocketEvent =
	| { type: "message"; data: ChatMessageItem }
	| { type: "reaction"; data: ChatReactionEvent }
	| { type: "delete"; data: { messageId: string } }
	| { type: "typing" };

/** Publiczny interfejs hooka: stan wskaźnika + throttlowane powiadomienie o pisaniu. */
export interface ChatSocketApi {
	isSomeoneTyping: boolean;
	notifyTyping: () => void;
}

/** Opcje hooka — callback usunięcia (F6): ChatView animuje bąbelek i dopiero
 *  po animacji czyści cache (dlatego delete nie rusza cache'a wprost w hooku). */
export interface UseChatSocketOptions {
	onDelete?: (messageId: string) => void;
}

function chatSocketUrl(): string {
	const protocol = window.location.protocol === "https:" ? "wss" : "ws";
	return `${protocol}://${window.location.host}/api/chat/ws`;
}

/** Dispatch eventu z DO: message → cache wiadomości, reaction → cache reakcji,
 *  delete → callback (animacja przed kasowaniem cache), typing → callback
 *  (kropki + zegar wygaśnięcia). Wydzielone z onmessage (czytelność + limit złożoności). */
function handleChatSocketEvent(
	parsed: ChatSocketEvent,
	queryClient: QueryClient,
	onTyping: () => void,
	onDelete?: (messageId: string) => void,
): void {
	if (parsed.type === "message" && parsed.data) {
		appendChatMessageIfNew(queryClient, parsed.data);
	} else if (parsed.type === "reaction" && parsed.data) {
		// Reakcja (kogokolwiek — własne echo dedupe'uje applyReactionEvent).
		queryClient.setQueryData<ChatReactionItem[]>(CHAT_REACTIONS_KEY, (old) =>
			applyReactionEvent(old, parsed.data),
		);
	} else if (parsed.type === "delete" && parsed.data) {
		onDelete?.(parsed.data.messageId);
	} else if (parsed.type === "typing") {
		onTyping();
	}
}

/**
 * Dokleja wiadomość do cache'a listy czatu **z dedupe po id** — jedyna droga
 * wpadania wiadomości po stronie klienta (WS broadcast, potwierdzenie POST).
 * Broadcast własnej wiadomości często wygra wyścig z odpowiedzią HTTP, więc
 * KAŻDE doklejenie musi sprawdzać, czy id już jest w liście.
 */
export function appendChatMessageIfNew(queryClient: QueryClient, message: ChatMessageItem): void {
	queryClient.setQueryData<ChatMessageItem[]>(CHAT_MESSAGES_KEY, (old) => {
		const list = old ?? [];
		if (list.some((existing) => existing.id === message.id)) return list;
		return [...list, message];
	});
}

/**
 * Usuwa wiadomość i jej reakcje z cache'a (F6 #157) — wywoływane przez ChatView
 * PO animacji zniknięcia bąbelka. Idempotentne (echo WS po własnym DELETE = no-op).
 */
export function removeChatMessage(queryClient: QueryClient, messageId: string): void {
	queryClient.setQueryData<ChatMessageItem[]>(CHAT_MESSAGES_KEY, (old) =>
		(old ?? []).filter((message) => message.id !== messageId),
	);
	queryClient.setQueryData<ChatReactionItem[]>(CHAT_REACTIONS_KEY, (old) =>
		(old ?? []).filter((item) => item.messageId !== messageId),
	);
}

/**
 * Live czat (F2): odbiera wiadomości przez WebSocket (/api/chat/ws) i dopisuje je
 * do cache'a listy (dedupe po id — broadcast własnej wiadomości oraz refetch po
 * reconnect nie dublują). Po (re)połączeniu invaliduje listę = refetch bez luk.
 * Wysyłka wiadomości NIGDY nie idzie przez WS — zawsze HTTP POST (PRD).
 *
 * Typing (F3 #154): przychodzący anonimowy event pokazuje „ktoś pisze…" i wystawia
 * ~3s wygaśnięcie (każdy kolejny event resetuje zegar); `notifyTyping` wysyła
 * własny event maks. raz na 2s i tylko na otwartym sockecie.
 */
export function useChatSocket(options: UseChatSocketOptions = {}): ChatSocketApi {
	const queryClient = useQueryClient();
	const [isSomeoneTyping, setIsSomeoneTyping] = useState(false);
	const socketRef = useRef<WebSocket | null>(null);
	const typingExpiryRef = useRef<number | undefined>(undefined);
	const lastTypingSentRef = useRef(0);
	// Latest-ref: socket żyje między renderami, callback delete zawsze świeży
	// bez rozbierania połączenia przy każdej zmianie tożsamości funkcji.
	const onDeleteRef = useRef(options.onDelete);

	useEffect(() => {
		onDeleteRef.current = options.onDelete;
	});

	useEffect(() => {
		let disposed = false;
		let socket: WebSocket | null = null;
		let reconnectTimer: number | undefined;
		let attempt = 0;

		function connect() {
			if (disposed) return;
			socket = new WebSocket(chatSocketUrl());
			socketRef.current = socket;
			socket.onopen = () => {
				attempt = 0;
				// Refetch po (re)connect — łata ewentualne luki z czasu offline.
				void queryClient.invalidateQueries({ queryKey: CHAT_MESSAGES_KEY });
				void queryClient.invalidateQueries({ queryKey: CHAT_REACTIONS_KEY });
			};
			socket.onmessage = (event) => {
				try {
					const parsed = JSON.parse(event.data as string) as ChatSocketEvent;
					handleChatSocketEvent(
						parsed,
						queryClient,
						() => {
							// Ktoś inny pisze — kropki w górę, zegar wygaśnięcia od nowa.
							setIsSomeoneTyping(true);
							window.clearTimeout(typingExpiryRef.current);
							typingExpiryRef.current = window.setTimeout(
								() => setIsSomeoneTyping(false),
								TYPING_EXPIRY_MS,
							);
						},
						onDeleteRef.current,
					);
				} catch {
					// Złe payloady ignorujemy — socket żyje dalej.
				}
			};
			socket.onclose = () => {
				if (disposed) return;
				attempt += 1;
				const delay = Math.min(
					RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1),
					RECONNECT_MAX_DELAY_MS,
				);
				reconnectTimer = window.setTimeout(connect, delay);
			};
		}

		connect();
		return () => {
			disposed = true;
			if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
			window.clearTimeout(typingExpiryRef.current);
			socketRef.current = null;
			socket?.close();
		};
	}, [queryClient]);

	const notifyTyping = useCallback(() => {
		const socket = socketRef.current;
		if (!socket || socket.readyState !== WebSocket.OPEN) return;
		const now = Date.now();
		if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
		lastTypingSentRef.current = now;
		socket.send(JSON.stringify({ type: "typing" }));
	}, []);

	return { isSomeoneTyping, notifyTyping };
}
