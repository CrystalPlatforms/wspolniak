// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu API (F1 #152):
// - POST /api/chat/messages: body {text} (trim, 1–200 znaków); author zawsze z sesji;
//   odpowiedź 201 {data: wiadomość z autorem} — pełny kształt po stronie klienta.
// - GET /api/chat/messages: lista z ostatnich 24h (filtr expires_at w domenie).
// - Bez sesji → 401 na obu metodach (authMiddleware).
import { Hono } from "hono";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
}));

vi.mock("@/db/chat", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/db/chat")>();
	return {
		...actual,
		createChatMessage: vi.fn(),
		listChatMessages: vi.fn(),
	};
});

import { createChatMessage, listChatMessages } from "@/db/chat";
import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import chatEndpoint from "./chat";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockCreateMessage = vi.mocked(createChatMessage);
const mockListMessages = vi.mocked(listChatMessages);

function createApi() {
	const api = new Hono<{
		Bindings: { SESSION_SECRET: string; CHAT_ROOM: unknown };
	}>().basePath("/api");
	api.route("/chat", chatEndpoint);
	return api;
}

/** Mock bindingu CHAT_ROOM (RPC stub DO) — domyślnie: limit przepuszcza, broadcast OK. */
const chatRoomStub = {
	checkAndIncrementRateLimit: vi.fn<(userId: string) => Promise<boolean>>(),
	broadcastMessage: vi.fn<(message: unknown) => Promise<void>>(),
	fetch: vi.fn<(request: Request) => Promise<Response>>(),
};
const chatRoomNamespace = {
	idFromName: vi.fn().mockReturnValue("chat-room-id"),
	get: vi.fn().mockReturnValue(chatRoomStub),
};

const env = { SESSION_SECRET: "secret", CHAT_ROOM: chatRoomNamespace };

function authedRequest(init?: RequestInit) {
	return {
		...init,
		headers: { Cookie: "session=valid-jwt", ...init?.headers },
	};
}

const now = new Date();

function authedUser() {
	mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
	mockFindUser.mockResolvedValue({
		id: "u1",
		name: "Tomek",
		role: "member",
		tokenHash: "hash",
		deletedAt: null,
		createdAt: new Date(),
	});
}

describe("POST /api/chat/messages", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
		chatRoomStub.checkAndIncrementRateLimit.mockResolvedValue(true);
		chatRoomStub.broadcastMessage.mockResolvedValue(undefined);
	});

	it("creates a message for the session user and returns it with the author", async () => {
		mockCreateMessage.mockResolvedValue({
			id: "msg-1",
			authorId: "u1",
			text: "Cześć!",
			replyToId: null,
			replyText: null,
			createdAt: now,
			expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
		});

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: "Cześć!" }),
			}),
			env,
		);

		expect(res.status).toBe(201);
		// Autor zawsze z sesji — nigdy z body.
		expect(mockCreateMessage).toHaveBeenCalledWith({ authorId: "u1", text: "Cześć!" });
		const json = (await res.json()) as {
			data: { text: string; author: { id: string; name: string } };
		};
		expect(json.data.text).toBe("Cześć!");
		expect(json.data.author).toEqual({ id: "u1", name: "Tomek" });
	});

	it("checks the room rate limit before the DB write and broadcasts the message after it", async () => {
		mockCreateMessage.mockResolvedValue({
			id: "msg-1",
			authorId: "u1",
			text: "Cześć!",
			replyToId: null,
			replyText: null,
			createdAt: now,
			expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
		});

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: "Cześć!" }),
			}),
			env,
		);

		expect(res.status).toBe(201);
		// Limit sprawdzony dla usera z sesji, w pokolu "global".
		expect(chatRoomNamespace.idFromName).toHaveBeenCalledWith("global");
		expect(chatRoomStub.checkAndIncrementRateLimit).toHaveBeenCalledWith("u1");
		// Broadcast po zapisie — z pełnym kształtem (id + autor) jak w odpowiedzi.
		expect(chatRoomStub.broadcastMessage).toHaveBeenCalledTimes(1);
		expect(chatRoomStub.broadcastMessage.mock.calls[0]?.[0]).toMatchObject({
			id: "msg-1",
			author: { id: "u1", name: "Tomek" },
		});
	});

	it("rejects text longer than 200 chars with 400", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: "a".repeat(201) }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateMessage).not.toHaveBeenCalled();
	});

	it("rejects whitespace-only text with 400 (trim)", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: "   " }),
			}),
			env,
		);

		expect(res.status).toBe(400);
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: "Cześć!" }),
			},
			env,
		);

		expect(res.status).toBe(401);
		expect(mockCreateMessage).not.toHaveBeenCalled();
	});

	it("rejects the 11th message in a minute with 429 and skips the DB write + broadcast", async () => {
		chatRoomStub.checkAndIncrementRateLimit.mockResolvedValue(false);

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: "Za dużo!" }),
			}),
			env,
		);

		expect(res.status).toBe(429);
		expect(mockCreateMessage).not.toHaveBeenCalled();
		expect(chatRoomStub.broadcastMessage).not.toHaveBeenCalled();
	});
});

describe("GET /api/chat/ws", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("forwards the authenticated upgrade to the ChatRoom DO with the session user id", async () => {
		// jsdom nie skonstruuje Response(101) — mock DO zwraca 200; handler przepuszcza
		// odpowiedź DO 1:1, więc asertujemy tożsamość instancji (w runtime to prawdziwe 101).
		const doResponse = new Response(null, { status: 200 });
		chatRoomStub.fetch.mockResolvedValue(doResponse);

		const api = createApi();
		const res = await api.request("/api/chat/ws", authedRequest(), env);

		expect(res).toBe(doResponse);
		expect(chatRoomNamespace.idFromName).toHaveBeenCalledWith("global");
		const forwarded = chatRoomStub.fetch.mock.calls[0]?.[0] as Request;
		expect(forwarded.headers.get("x-chat-user-id")).toBe("u1");
	});

	it("returns 401 without a valid session (no upgrade, DO untouched)", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request("/api/chat/ws", {}, env);

		expect(res.status).toBe(401);
		expect(chatRoomStub.fetch).not.toHaveBeenCalled();
	});
});

describe("GET /api/chat/messages", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("returns the 24h message list with authors", async () => {
		const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
		mockListMessages.mockResolvedValue([
			{
				id: "msg-1",
				authorId: "u2",
				text: "Dzień dobry!",
				replyToId: null,
				replyText: null,
				createdAt: now,
				expiresAt,
				author: { id: "u2", name: "Kasia" },
			},
		]);

		const api = createApi();
		const res = await api.request("/api/chat/messages", authedRequest(), env);

		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { id: string; author: { name: string } }[] };
		expect(json.data).toHaveLength(1);
		expect(json.data[0]?.author.name).toBe("Kasia");
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request("/api/chat/messages", {}, env);

		expect(res.status).toBe(401);
	});
});
