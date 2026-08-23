// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu useChatSocket (F2 #153):
// - Łączy z /api/chat/ws (ws:// lub wss:// zależnie od protokołu strony).
// - Wiadomość {type:"message", data} → dopisek do cache CHAT_MESSAGES_KEY
//   z dedupe po id (broadcast własnej wiadomości + refetch nie dublują).
// - onopen (także po reconnect) → invalidate CHAT_MESSAGES_KEY (refetch: brak luk).
// - onclose → reconnect z backoff 1s→2s→4s… max 15s; reset licznika po udanym połączeniu.
// - WebSocket to granica przeglądarki — FakeWebSocket przez vi.stubGlobal.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { CHAT_REACTIONS_KEY } from "./chat-reactions";
import { CHAT_MESSAGES_KEY, type ChatMessageItem } from "./chat-view";
import { removeChatMessage, useChatSocket } from "./use-chat-socket";

class FakeWebSocket {
	static instances: FakeWebSocket[] = [];
	/** WebSocket.OPEN === 1 (wartość z przeglądarki; używana przez throttle typingu). */
	static readonly OPEN = 1;
	url: string;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onclose: (() => void) | null = null;
	closed = false;
	send = vi.fn();
	readyState: number = FakeWebSocket.OPEN;

	constructor(url: string) {
		this.url = url;
		FakeWebSocket.instances.push(this);
	}

	close() {
		this.closed = true;
		this.readyState = 3; // CLOSED
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

/** Wiadomość do seedowania cache'a (ten sam kształt co incoming). */
function listMessage(id: string): ChatMessageItem {
	return {
		id,
		authorId: "u2",
		text: `Wiadomość ${id}`,
		replyToId: null,
		replyText: null,
		createdAt: "2026-08-22T10:00:00.000Z",
		expiresAt: "2026-08-23T10:00:00.000Z",
		author: { id: "u2", name: "Kasia" },
	};
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

describe("useChatSocket — typing indicator (F3 #154)", () => {
	it("shows someone typing on a typing event and auto-hides ~3s after the last one", () => {
		vi.useFakeTimers();
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		vi.stubGlobal("WebSocket", FakeWebSocket);

		const { result } = renderHook(() => useChatSocket(), { wrapper: createWrapper(client) });
		const socket = FakeWebSocket.instances[0];
		expect(socket).toBeDefined();

		act(() => {
			socket?.onmessage?.({ data: JSON.stringify({ type: "typing" }) });
		});
		expect(result.current.isSomeoneTyping).toBe(true);

		// Drugi event po 2.5s resetuje zegar wygaśnięcia.
		act(() => {
			vi.advanceTimersByTime(2_500);
			socket?.onmessage?.({ data: JSON.stringify({ type: "typing" }) });
		});
		act(() => {
			vi.advanceTimersByTime(2_999);
		});
		expect(result.current.isSomeoneTyping).toBe(true);
		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(result.current.isSomeoneTyping).toBe(false);
	});

	it("notifyTyping sends a typing event at most once per 2s while the socket is open", () => {
		vi.useFakeTimers();
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		vi.stubGlobal("WebSocket", FakeWebSocket);

		const { result } = renderHook(() => useChatSocket(), { wrapper: createWrapper(client) });
		const socket = FakeWebSocket.instances[0];

		act(() => result.current.notifyTyping());
		act(() => result.current.notifyTyping());
		expect(socket?.send).toHaveBeenCalledTimes(1);
		expect(socket?.send).toHaveBeenCalledWith(JSON.stringify({ type: "typing" }));

		act(() => {
			vi.advanceTimersByTime(2_000);
		});
		act(() => result.current.notifyTyping());
		expect(socket?.send).toHaveBeenCalledTimes(2);
	});

	it("notifyTyping does not send before the socket is open", () => {
		vi.useFakeTimers();
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		vi.stubGlobal("WebSocket", FakeWebSocket);

		const { result } = renderHook(() => useChatSocket(), { wrapper: createWrapper(client) });
		const socket = FakeWebSocket.instances[0];
		socket.readyState = 0; // CONNECTING

		act(() => result.current.notifyTyping());
		expect(socket?.send).not.toHaveBeenCalled();
	});
});

describe("useChatSocket — reaction events (F4 #155)", () => {
	it("applies incoming reaction events to the reactions cache: added (deduped) then removed", async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		vi.stubGlobal("WebSocket", FakeWebSocket);

		renderHook(() => useChatSocket(), { wrapper: createWrapper(client) });
		const socket = FakeWebSocket.instances[0];

		const event = {
			type: "reaction",
			data: {
				messageId: "m-1",
				reaction: "heart",
				action: "added",
				user: { id: "u2", name: "Kasia" },
			},
		};
		act(() => {
			socket?.onmessage?.({ data: JSON.stringify(event) });
		});
		// Własne echo (ten sam event drugi raz) nie dubluje — dedupe po trójce.
		act(() => {
			socket?.onmessage?.({ data: JSON.stringify(event) });
		});
		await waitFor(() => {
			const list = client.getQueryData<unknown[]>(CHAT_REACTIONS_KEY) ?? [];
			expect(list).toHaveLength(1);
		});

		act(() => {
			socket?.onmessage?.({
				data: JSON.stringify({ ...event, data: { ...event.data, action: "removed" } }),
			});
		});
		await waitFor(() => {
			expect(client.getQueryData<unknown[]>(CHAT_REACTIONS_KEY)).toEqual([]);
		});
	});

	it("refetches the reactions list when the (re)connection opens", async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		vi.stubGlobal("WebSocket", FakeWebSocket);

		renderHook(() => useChatSocket(), { wrapper: createWrapper(client) });

		FakeWebSocket.instances[0]?.onopen?.();
		await waitFor(() => {
			expect(invalidateSpy).toHaveBeenCalledWith(
				expect.objectContaining({ queryKey: CHAT_REACTIONS_KEY }),
			);
		});
	});
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

// Założenia kontraktu F6 #157 (delete):
// - Event {type:"delete", data:{messageId}} NIE rusza cache'a w hooku —
//   ChatView najpierw animuje bąbelek; kasowanie cache robi removeChatMessage.
// - removeChatMessage czyści wiadomość z CHAT_MESSAGES_KEY i jej reakcje
//   z CHAT_REACTIONS_KEY; idempotentne (echo po własnym DELETE = no-op).
describe("useChatSocket — delete (F6 #157)", () => {
	it("invokes onDelete with the messageId without touching the message cache", () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		client.setQueryData(CHAT_MESSAGES_KEY, [listMessage("m1")]);
		vi.stubGlobal("WebSocket", FakeWebSocket);
		const onDelete = vi.fn();

		renderHook(() => useChatSocket({ onDelete }), { wrapper: createWrapper(client) });
		const socket = FakeWebSocket.instances[0];
		expect(socket).toBeDefined();

		act(() => {
			socket?.onmessage?.({ data: JSON.stringify({ type: "delete", data: { messageId: "m1" } }) });
		});

		expect(onDelete).toHaveBeenCalledWith("m1");
		// Cache nietknięty — animację i sprzątanie prowadzi ChatView.
		expect(client.getQueryData(CHAT_MESSAGES_KEY)).toHaveLength(1);
	});
});

describe("removeChatMessage (F6 #157)", () => {
	it("drops the message and its reactions from both caches", () => {
		const client = new QueryClient();
		client.setQueryData(CHAT_MESSAGES_KEY, [listMessage("m1"), listMessage("m2")]);
		client.setQueryData(CHAT_REACTIONS_KEY, [
			{ messageId: "m1", userId: "u2", reaction: "heart", user: { id: "u2", name: "Kasia" } },
			{ messageId: "m2", userId: "u3", reaction: "laugh", user: { id: "u3", name: "Ala" } },
		]);

		removeChatMessage(client, "m1");

		const messages = client.getQueryData<ChatMessageItem[]>(CHAT_MESSAGES_KEY);
		expect(messages?.map((m) => m.id)).toEqual(["m2"]);
		const reactions = client.getQueryData<{ messageId: string }[]>(CHAT_REACTIONS_KEY);
		expect(reactions?.map((r) => r.messageId)).toEqual(["m2"]);
	});

	it("is idempotent — a second removal (own WS echo) is a no-op", () => {
		const client = new QueryClient();
		client.setQueryData(CHAT_MESSAGES_KEY, [listMessage("m2")]);

		removeChatMessage(client, "m1");
		removeChatMessage(client, "m1");

		expect(client.getQueryData<ChatMessageItem[]>(CHAT_MESSAGES_KEY)).toHaveLength(1);
	});
});
