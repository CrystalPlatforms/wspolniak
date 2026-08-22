// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu useChatSocket (F2 #153):
// - Łączy z /api/chat/ws (ws:// lub wss:// zależnie od protokołu strony).
// - Wiadomość {type:"message", data} → dopisek do cache CHAT_MESSAGES_KEY
//   z dedupe po id (broadcast własnej wiadomości + refetch nie dublują).
// - onopen (także po reconnect) → invalidate CHAT_MESSAGES_KEY (refetch: brak luk).
// - onclose → reconnect z backoff 1s→2s→4s… max 15s; reset licznika po udanym połączeniu.
// - WebSocket to granica przeglądarki — FakeWebSocket przez vi.stubGlobal.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { CHAT_MESSAGES_KEY, type ChatMessageItem } from "./chat-view";
import { useChatSocket } from "./use-chat-socket";

class FakeWebSocket {
	static instances: FakeWebSocket[] = [];
	url: string;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onclose: (() => void) | null = null;
	closed = false;

	constructor(url: string) {
		this.url = url;
		FakeWebSocket.instances.push(this);
	}

	close() {
		this.closed = true;
		this.onclose?.();
	}
}

function incoming(id: string) {
	return JSON.stringify({
		type: "message",
		data: {
			id,
			authorId: "u2",
			text: `Wiadomość ${id}`,
			replyToId: null,
			replyText: null,
			createdAt: "2026-08-22T10:00:00.000Z",
			expiresAt: "2026-08-23T10:00:00.000Z",
			author: { id: "u2", name: "Kasia" },
		} satisfies ChatMessageItem,
	});
}

function createWrapper(client: QueryClient) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	FakeWebSocket.instances = [];
	vi.useRealTimers();
});

describe("useChatSocket", () => {
	it("connects to /api/chat/ws and appends incoming messages to the cache, deduped by id", async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		client.setQueryData<ChatMessageItem[]>(CHAT_MESSAGES_KEY, []);
		vi.stubGlobal("WebSocket", FakeWebSocket);

		renderHook(() => useChatSocket(), { wrapper: createWrapper(client) });

		const socket = FakeWebSocket.instances[0];
		expect(socket).toBeDefined();
		expect(socket?.url).toContain("/api/chat/ws");

		socket?.onmessage?.({ data: incoming("m1") });
		// Ten sam id jeszcze raz (np. własny broadcast + refetch) — bez duplikatu.
		socket?.onmessage?.({ data: incoming("m1") });
		socket?.onmessage?.({ data: incoming("m2") });

		await waitFor(() => {
			const list = client.getQueryData<ChatMessageItem[]>(CHAT_MESSAGES_KEY) ?? [];
			expect(list.map((m) => m.id)).toEqual(["m1", "m2"]);
		});
	});

	it("refetches the message list when the (re)connection opens", async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		vi.stubGlobal("WebSocket", FakeWebSocket);

		renderHook(() => useChatSocket(), { wrapper: createWrapper(client) });

		FakeWebSocket.instances[0]?.onopen?.();
		await waitFor(() => {
			expect(invalidateSpy).toHaveBeenCalledWith(
				expect.objectContaining({ queryKey: CHAT_MESSAGES_KEY }),
			);
		});
	});

	it("reconnects with backoff after the socket closes", async () => {
		vi.useFakeTimers();
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		vi.stubGlobal("WebSocket", FakeWebSocket);

		renderHook(() => useChatSocket(), { wrapper: createWrapper(client) });
		expect(FakeWebSocket.instances).toHaveLength(1);

		// Zamknięcie → pierwsza próba po 1s.
		FakeWebSocket.instances[0]?.close();
		vi.advanceTimersByTime(999);
		expect(FakeWebSocket.instances).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(FakeWebSocket.instances).toHaveLength(2);

		// Drugie zamknięcie → backoff rośnie do 2s.
		FakeWebSocket.instances[1]?.close();
		vi.advanceTimersByTime(1999);
		expect(FakeWebSocket.instances).toHaveLength(2);
		vi.advanceTimersByTime(1);
		expect(FakeWebSocket.instances).toHaveLength(3);

		// Udane połączenie resetuje licznik backoffu.
		FakeWebSocket.instances[2]?.onopen?.();
		FakeWebSocket.instances[2]?.close();
		vi.advanceTimersByTime(1000);
		expect(FakeWebSocket.instances).toHaveLength(4);
	});

	it("stops reconnecting after unmount", () => {
		vi.useFakeTimers();
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		vi.stubGlobal("WebSocket", FakeWebSocket);

		const { unmount } = renderHook(() => useChatSocket(), { wrapper: createWrapper(client) });
		unmount();

		FakeWebSocket.instances[0]?.close();
		vi.advanceTimersByTime(60_000);
		expect(FakeWebSocket.instances).toHaveLength(1);
	});
});
