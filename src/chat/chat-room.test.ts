// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu ChatRoom DO (F2 #153):
// - broadcastMessage(payload) serializuje {type:"message", data} i wysyła do WSZYSTKICH
//   podłączonych socketów (hibernacja: this.ctx.getWebSockets()); dedupe robi klient.
// - checkAndIncrementRateLimit(userId): check-and-increment, stałe okno 60s,
//   limit 10 — 11. wiadomość w oknie zwraca false; po wygaśnięciu okna licznik startuje od zera.
// - Upgrade: fetch() z nagłówkiem x-chat-user-id taguje socket userId (hibernacja)
//   i zapisuje attachment {userId} — pod getConnectedUserIds() (użycie w F7).
// - DurableObjectState i WebSocket to granice runtimeu — mockowane.
import { ChatRoom } from "./chat-room";

interface MockSocket {
	send: ReturnType<typeof vi.fn>;
	serializeAttachment: ReturnType<typeof vi.fn>;
	deserializeAttachment: ReturnType<typeof vi.fn>;
}

function mockSocket(overrides: Partial<Record<string, unknown>> = {}): MockSocket {
	return {
		send: vi.fn(),
		serializeAttachment: vi.fn(),
		deserializeAttachment: vi.fn(),
		...overrides,
	} as MockSocket;
}

function createMockState() {
	return {
		acceptWebSocket: vi.fn(),
		getWebSockets: vi.fn(() => [] as unknown[]) as () => unknown[],
		storage: {
			get: vi.fn(),
			put: vi.fn(),
			delete: vi.fn(),
		},
	};
}

function createRoom(state = createMockState()) {
	const room = new ChatRoom(state as never, {} as never);
	return { room, state };
}

describe("ChatRoom — broadcast", () => {
	it("sends the serialized message to every connected socket", async () => {
		const sockets = [mockSocket(), mockSocket()];
		const state = createMockState();
		state.getWebSockets = () => sockets;
		const room = new ChatRoom(state as never, {} as never);

		await room.broadcastMessage({ id: "m1", text: "Cześć" });

		for (const ws of sockets) {
			expect(ws.send).toHaveBeenCalledWith(
				JSON.stringify({ type: "message", data: { id: "m1", text: "Cześć" } }),
			);
		}
	});

	it("broadcast to an empty room is a no-op", async () => {
		const { room } = createRoom();
		await expect(room.broadcastMessage({ id: "m2" })).resolves.toBeUndefined();
	});
});

describe("ChatRoom — rate limit (10/min)", () => {
	function createRoomWithStorage() {
		const state = createMockState();
		const map = new Map<string, unknown>();
		state.storage.get = vi.fn(async (key: string) => map.get(key));
		state.storage.put = vi.fn(async (key: string, value: unknown) => {
			map.set(key, value);
		});
		const room = new ChatRoom(state as never, {} as never);
		return { room, state, map };
	}

	it("allows 10 messages within a minute and rejects the 11th", async () => {
		const { room } = createRoomWithStorage();

		for (let i = 0; i < 10; i += 1) {
			expect(await room.checkAndIncrementRateLimit("u1")).toBe(true);
		}
		expect(await room.checkAndIncrementRateLimit("u1")).toBe(false);
		// Licznik jest per user — inny użytkownik zaczyna od zera.
		expect(await room.checkAndIncrementRateLimit("u2")).toBe(true);
	});

	it("resets the counter when the 60s window expires", async () => {
		vi.useFakeTimers();
		try {
			const { room } = createRoomWithStorage();

			for (let i = 0; i < 10; i += 1) {
				expect(await room.checkAndIncrementRateLimit("u1")).toBe(true);
			}
			expect(await room.checkAndIncrementRateLimit("u1")).toBe(false);

			// Okno minęło — licznik startuje od zera.
			vi.setSystemTime(Date.now() + 61_000);
			expect(await room.checkAndIncrementRateLimit("u1")).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("ChatRoom — connected users", () => {
	it("returns the unique user ids of currently connected sockets (pod F7: suppress push)", async () => {
		const state = createMockState();
		const sockets = [
			mockSocket({ deserializeAttachment: vi.fn(() => ({ userId: "u1" })) }),
			mockSocket({ deserializeAttachment: vi.fn(() => ({ userId: "u1" })) }),
			mockSocket({ deserializeAttachment: vi.fn(() => ({ userId: "u2" })) }),
		];
		state.getWebSockets = () => sockets;

		const room = new ChatRoom(state as never, {} as never);
		const connected = await room.getConnectedUserIds();

		expect(connected.sort()).toEqual(["u1", "u2"]);
	});
});

describe("ChatRoom — typing indicator (F3 #154)", () => {
	it("broadcasts an anonymous typing event to other users, never back to the sender", async () => {
		const state = createMockState();
		const sender = mockSocket({ deserializeAttachment: vi.fn(() => ({ userId: "u1" })) });
		// Druga karta tego samego usera — też nie może widzieć własnego typingu.
		const sameUserTab = mockSocket({ deserializeAttachment: vi.fn(() => ({ userId: "u1" })) });
		const other = mockSocket({ deserializeAttachment: vi.fn(() => ({ userId: "u2" })) });
		state.getWebSockets = () => [sender, sameUserTab, other];

		const room = new ChatRoom(state as never, {} as never);
		await room.webSocketMessage(sender as never, JSON.stringify({ type: "typing" }));

		// Payload anonimowy — samo {type:"typing"}, bez żadnej tożsamości (PRD).
		expect(other.send).toHaveBeenCalledWith(JSON.stringify({ type: "typing" }));
		expect(sender.send).not.toHaveBeenCalled();
		expect(sameUserTab.send).not.toHaveBeenCalled();
	});

	it("ignores malformed and non-typing messages without broadcasting anything", async () => {
		const state = createMockState();
		const sender = mockSocket({ deserializeAttachment: vi.fn(() => ({ userId: "u1" })) });
		const other = mockSocket({ deserializeAttachment: vi.fn(() => ({ userId: "u2" })) });
		state.getWebSockets = () => [sender, other];

		const room = new ChatRoom(state as never, {} as never);
		await room.webSocketMessage(sender as never, "nie-json");
		await room.webSocketMessage(sender as never, JSON.stringify({ type: "message", data: {} }));
		await room.webSocketMessage(sender as never, new ArrayBuffer(0));

		expect(other.send).not.toHaveBeenCalled();
	});
});

describe("ChatRoom — generic event broadcast (F4 #155)", () => {
	it("broadcasts an event of any type to every connected socket", async () => {
		const sockets = [mockSocket(), mockSocket()];
		const state = createMockState();
		state.getWebSockets = () => sockets;

		const room = new ChatRoom(state as never, {} as never);
		await room.broadcastEvent("reaction", { messageId: "m1", reaction: "heart", action: "added" });

		for (const ws of sockets) {
			expect(ws.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "reaction",
					data: { messageId: "m1", reaction: "heart", action: "added" },
				}),
			);
		}
	});
});

describe("ChatRoom — WebSocket upgrade", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("accepts the server socket tagged with the user id and returns 101 with the client side", async () => {
		const state = createMockState();
		const server = mockSocket();
		const client = { fake: "client" };
		// WebSocketPair + Response(101) istnieją tylko w workerd — stuby globali (granica runtimeu).
		vi.stubGlobal(
			"WebSocketPair",
			class {
				0 = client;
				1 = server;
			},
		);
		vi.stubGlobal(
			"Response",
			class {
				status: number;
				webSocket: unknown;
				constructor(_body: unknown, init?: { status?: number; webSocket?: unknown }) {
					this.status = init?.status ?? 200;
					this.webSocket = init?.webSocket;
				}
			},
		);

		const room = new ChatRoom(state as never, {} as never);
		const res = await room.fetch(
			new Request("https://chat-room/connect", { headers: { "x-chat-user-id": "u1" } }),
		);

		expect(res.status).toBe(101);
		// Klient dostaje swoją stronę pary; serwerowa zostaje w DO.
		expect((res as unknown as { webSocket: unknown }).webSocket).toBe(client);
		// Hibernacja: socket zaakceptowany z tagiem userId + attachment pod connected set.
		expect(state.acceptWebSocket).toHaveBeenCalledWith(server, ["u1"]);
		expect(server.serializeAttachment).toHaveBeenCalledWith({ userId: "u1" });
	});

	it("rejects the upgrade without the trusted user header", async () => {
		const room = new ChatRoom(createMockState() as never, {} as never);
		const res = await room.fetch(new Request("https://chat-room/connect"));

		expect(res.status).toBe(400);
	});
});
