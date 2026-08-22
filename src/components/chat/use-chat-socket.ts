// SPDX-License-Identifier: AGPL-3.0-or-later

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { CHAT_MESSAGES_KEY, type ChatMessageItem } from "./chat-view";

/** Backoff reconnectu: 1s → 2s → 4s → … max 15s; reset po udanym połączeniu. */
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 15_000;

/** Wydarzenia z DO — w F2 tylko wiadomości (typing przyjdzie w F3). */
interface ChatSocketEvent {
	type: "message";
	data: ChatMessageItem;
}

function chatSocketUrl(): string {
	const protocol = window.location.protocol === "https:" ? "wss" : "ws";
	return `${protocol}://${window.location.host}/api/chat/ws`;
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
 * Live czat (F2): odbiera wiadomości przez WebSocket (/api/chat/ws) i dopisuje je
 * do cache'a listy (dedupe po id — broadcast własnej wiadomości oraz refetch po
 * reconnect nie dublują). Po (re)połączeniu invaliduje listę = refetch bez luk.
 * Wysyłka NIGDY nie idzie przez WS — zawsze HTTP POST (PRD).
 */
export function useChatSocket(): void {
	const queryClient = useQueryClient();

	useEffect(() => {
		let disposed = false;
		let socket: WebSocket | null = null;
		let reconnectTimer: number | undefined;
		let attempt = 0;

		function connect() {
			if (disposed) return;
			socket = new WebSocket(chatSocketUrl());
			socket.onopen = () => {
				attempt = 0;
				// Refetch po (re)connect — łata ewentualne luki z czasu offline.
				void queryClient.invalidateQueries({ queryKey: CHAT_MESSAGES_KEY });
			};
			socket.onmessage = (event) => {
				try {
					const parsed = JSON.parse(event.data as string) as ChatSocketEvent;
					if (parsed?.type === "message" && parsed.data) {
						appendChatMessageIfNew(queryClient, parsed.data);
					}
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
			socket?.close();
		};
	}, [queryClient]);
}
