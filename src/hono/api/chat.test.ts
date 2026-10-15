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
		deleteChatMessage: vi.fn(),
		getChatPollsState: vi.fn(),
		listChatMessages: vi.fn(),
		listChatReactions: vi.fn(),
		toggleChatReaction: vi.fn(),
		voteChatPoll: vi.fn(),
	};
});

// Karty udostępnionych postów (#218): resolucja id → (miniatura, wycinek, autor)
// idzie przez domenę postów — mockujemy granicę domen (testy listPostsByIds mają
// własny plik).
vi.mock("@/db/posts", () => ({
	listPostsByIds: vi.fn(),
}));

// Granice pusha (F7 #158): budowa depsów (VAPID) i fan-out — mockowane;
// test weryfuje ŚCIEŻKĘ wywołania (tylko POST /messages, nigdy reakcje).
vi.mock("@/core/push-deps", () => ({
	buildPushDeps: vi.fn(),
}));

vi.mock("@/core/notify", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/core/notify")>();
	return {
		...actual,
		notifyChatMessage: vi.fn(),
	};
});

import { AppError } from "@/core/errors";
import { notifyChatMessage } from "@/core/notify";
import { buildPushDeps } from "@/core/push-deps";
import {
	createChatMessage,
	deleteChatMessage,
	getChatPollsState,
	listChatMessages,
	listChatReactions,
	toggleChatReaction,
	voteChatPoll,
} from "@/db/chat";
import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import { listPostsByIds } from "@/db/posts";
import chatEndpoint from "./chat";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockCreateMessage = vi.mocked(createChatMessage);
const mockDeleteMessage = vi.mocked(deleteChatMessage);
const mockListMessages = vi.mocked(listChatMessages);
const mockListReactions = vi.mocked(listChatReactions);
const mockToggleReaction = vi.mocked(toggleChatReaction);
const mockVotePoll = vi.mocked(voteChatPoll);
const mockPollsState = vi.mocked(getChatPollsState);
const mockBuildPushDeps = vi.mocked(buildPushDeps);
const mockNotifyChat = vi.mocked(notifyChatMessage);
const mockListPostsByIds = vi.mocked(listPostsByIds);

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
	broadcastEvent: vi.fn<(type: string, data: unknown) => Promise<void>>(),
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
		aiOptIn: false,
		aiBlocked: false,
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
			kind: "text",
			payload: null,
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
		// Autor zawsze z sesji — nigdy z body; brak `kind` w body = zwykły tekst.
		expect(mockCreateMessage).toHaveBeenCalledWith({
			authorId: "u1",
			text: "Cześć!",
			replyToId: undefined,
			kind: "text",
			payload: undefined,
		});
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
			kind: "text",
			payload: null,
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
				kind: "text",
				payload: null,
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

describe("POST /api/chat/messages/:id/reactions (F4 #155)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
		chatRoomStub.broadcastEvent.mockResolvedValue(undefined);
	});

	it("adds the reaction for the session user, returns the action and broadcasts the event", async () => {
		mockToggleReaction.mockResolvedValue({ action: "added", reaction: "heart" });

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/msg-1/reactions",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reaction: "heart" }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		// Toggle dla usera z sesji; message id z parametru ścieżki.
		expect(mockToggleReaction).toHaveBeenCalledWith({
			messageId: "msg-1",
			userId: "u1",
			reaction: "heart",
		});
		const json = (await res.json()) as { data: { action: string } };
		expect(json.data.action).toBe("added");
		// Broadcast po zapisie — event reakcji z autorem zmiany (dla listy kto-zareagował).
		expect(chatRoomStub.broadcastEvent).toHaveBeenCalledTimes(1);
		expect(chatRoomStub.broadcastEvent).toHaveBeenCalledWith("reaction", {
			messageId: "msg-1",
			reaction: "heart",
			action: "added",
			user: { id: "u1", name: "Tomek" },
		});
	});

	it("removes the reaction on the second call (toggle) and broadcasts removed", async () => {
		mockToggleReaction.mockResolvedValue({ action: "removed", reaction: "heart" });

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/msg-1/reactions",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reaction: "heart" }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { action: string } };
		expect(json.data.action).toBe("removed");
		expect(chatRoomStub.broadcastEvent).toHaveBeenCalledWith(
			"reaction",
			expect.objectContaining({ action: "removed" }),
		);
	});

	it("replacing with a different type broadcasts removed(old) then added(new)", async () => {
		mockToggleReaction.mockResolvedValue({
			action: "replaced",
			reaction: "laugh",
			previous: "heart",
		});

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/msg-1/reactions",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reaction: "laugh" }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { action: string } };
		expect(json.data.action).toBe("replaced");
		// Dwa eventy — klient bez zmian zdejmuje starego i dokłada nowego.
		expect(chatRoomStub.broadcastEvent).toHaveBeenCalledTimes(2);
		expect(chatRoomStub.broadcastEvent).toHaveBeenNthCalledWith(1, "reaction", {
			messageId: "msg-1",
			reaction: "heart",
			action: "removed",
			user: { id: "u1", name: "Tomek" },
		});
		expect(chatRoomStub.broadcastEvent).toHaveBeenNthCalledWith(2, "reaction", {
			messageId: "msg-1",
			reaction: "laugh",
			action: "added",
			user: { id: "u1", name: "Tomek" },
		});
	});

	it("rejects an unknown reaction type with 400 (no toggle, no broadcast)", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/msg-1/reactions",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reaction: "party-parrot" }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockToggleReaction).not.toHaveBeenCalled();
		expect(chatRoomStub.broadcastEvent).not.toHaveBeenCalled();
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/msg-1/reactions",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reaction: "heart" }),
			},
			env,
		);

		expect(res.status).toBe(401);
		expect(mockToggleReaction).not.toHaveBeenCalled();
	});
});

describe("GET /api/chat/reactions (F4 #155)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("returns all reactions of visible messages with user names", async () => {
		mockListReactions.mockResolvedValue([
			{ messageId: "msg-1", userId: "u2", reaction: "heart", user: { id: "u2", name: "Kasia" } },
		]);

		const api = createApi();
		const res = await api.request("/api/chat/reactions", authedRequest(), env);

		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			data: { messageId: string; user: { name: string } | null }[];
		};
		expect(json.data).toHaveLength(1);
		expect(json.data[0]?.user?.name).toBe("Kasia");
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request("/api/chat/reactions", {}, env);

		expect(res.status).toBe(401);
	});
});

describe("POST /api/chat/messages — reply (F5 #156)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
		chatRoomStub.checkAndIncrementRateLimit.mockResolvedValue(true);
		chatRoomStub.broadcastMessage.mockResolvedValue(undefined);
	});

	it("passes replyToId through to the domain and returns the message with the snapshot quote", async () => {
		mockCreateMessage.mockResolvedValue({
			id: "msg-2",
			authorId: "u1",
			text: "Odpowiedź",
			kind: "text",
			payload: null,
			replyToId: "msg-1",
			replyText: "Oryginał",
			createdAt: now,
			expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
		});

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: "Odpowiedź", replyToId: "msg-1" }),
			}),
			env,
		);

		expect(res.status).toBe(201);
		expect(mockCreateMessage).toHaveBeenCalledWith({
			authorId: "u1",
			text: "Odpowiedź",
			replyToId: "msg-1",
			kind: "text",
			payload: undefined,
		});
		const json = (await res.json()) as { data: { replyToId: string; replyText: string } };
		expect(json.data.replyToId).toBe("msg-1");
		expect(json.data.replyText).toBe("Oryginał");
	});

	it("maps the domain AppError to 400 when the original is nonexistent/expired", async () => {
		mockCreateMessage.mockRejectedValue(
			new AppError(
				"Nie można odpowiedzieć na tę wiadomość — nie istnieje lub wygasła",
				"VALIDATION",
				400,
			),
		);

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: "Odpowiedź", replyToId: "gone" }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(chatRoomStub.broadcastMessage).not.toHaveBeenCalled();
	});

	it("rejects a non-string replyToId with 400 (Zod)", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: "Odpowiedź", replyToId: 123 }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateMessage).not.toHaveBeenCalled();
	});
});

describe("DELETE /api/chat/messages/:id (F6 #157)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
		chatRoomStub.broadcastEvent.mockResolvedValue(undefined);
	});

	it("deletes the author's own message and broadcasts the delete event", async () => {
		mockDeleteMessage.mockResolvedValue({ ok: true, data: undefined });

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/msg-1",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockDeleteMessage).toHaveBeenCalledWith({
			id: "msg-1",
			requesterId: "u1",
			requesterRole: "member",
		});
		expect(chatRoomStub.broadcastEvent).toHaveBeenCalledWith("delete", { messageId: "msg-1" });
	});

	it("allows an admin to delete any message", async () => {
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "admin" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "admin",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
		mockDeleteMessage.mockResolvedValue({ ok: true, data: undefined });

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/msg-1",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockDeleteMessage).toHaveBeenCalledWith(
			expect.objectContaining({ requesterRole: "admin" }),
		);
		expect(chatRoomStub.broadcastEvent).toHaveBeenCalledTimes(1);
	});

	it("rejects another member's delete with 403 and no broadcast (no content leak)", async () => {
		mockDeleteMessage.mockResolvedValue({
			ok: false,
			error: new AppError("Nie możesz usunąć tej wiadomości", "UNAUTHORIZED", 403),
		});

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/msg-1",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(403);
		const json = (await res.json()) as { data?: unknown; error: string };
		expect(json.data).toBeUndefined();
		expect(json.error).toBeDefined();
		expect(chatRoomStub.broadcastEvent).not.toHaveBeenCalled();
	});

	it("returns 404 for a nonexistent message", async () => {
		mockDeleteMessage.mockResolvedValue({
			ok: false,
			error: new AppError("Wiadomość nie istnieje", "NOT_FOUND", 404),
		});

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/gone",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(404);
		expect(chatRoomStub.broadcastEvent).not.toHaveBeenCalled();
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request("/api/chat/messages/msg-1", { method: "DELETE" }, env);

		expect(res.status).toBe(401);
		expect(mockDeleteMessage).not.toHaveBeenCalled();
	});
});

// Założenia kontraktu pusha (F7 #158):
// - TYLKO ścieżka POST /messages planuje notifyChatMessage (waitUntil, w tle —
//   błąd pusha nie psuje wysyłki); reakcje i typing nigdy.
// - buildPushDeps(env, messageId, "chat") — null bez VAPID → całkowity skip.
// - Autor z sesji; ten sam stub pokoju DO co broadcast.
describe("POST /api/chat/messages — push do niepodłączonych (F7 #158)", () => {
	const pushDepsSentinel = { sendPush: vi.fn() } as unknown as ReturnType<typeof buildPushDeps>;

	function execCtx() {
		return { waitUntil: vi.fn() } as unknown as ExecutionContext;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
		chatRoomStub.checkAndIncrementRateLimit.mockResolvedValue(true);
		chatRoomStub.broadcastMessage.mockResolvedValue(undefined);
		mockCreateMessage.mockResolvedValue({
			id: "msg-1",
			authorId: "u1",
			text: "Cześć!",
			kind: "text",
			payload: null,
			replyToId: null,
			replyText: null,
			createdAt: now,
			expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
		});
		mockBuildPushDeps.mockReturnValue(pushDepsSentinel);
		mockNotifyChat.mockResolvedValue(undefined);
	});

	it("schedules the chat push in the background after the broadcast", async () => {
		const ctx = execCtx();
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: "Cześć!" }),
			}),
			env,
			ctx,
		);

		expect(res.status).toBe(201);
		expect(mockBuildPushDeps).toHaveBeenCalledWith(env, "msg-1", "chat");
		expect(mockNotifyChat).toHaveBeenCalledTimes(1);
		const [deps, room, authorId] = mockNotifyChat.mock.calls[0] ?? [];
		expect(deps).toBe(pushDepsSentinel);
		expect(room).toBe(chatRoomStub);
		expect(authorId).toBe("u1");
		expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
	});

	it("skips the push entirely when VAPID is not configured (buildPushDeps → null)", async () => {
		mockBuildPushDeps.mockReturnValue(null);
		const ctx = execCtx();
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: "Cześć!" }),
			}),
			env,
			ctx,
		);

		expect(res.status).toBe(201);
		expect(mockNotifyChat).not.toHaveBeenCalled();
		expect(ctx.waitUntil).not.toHaveBeenCalled();
	});

	it("never schedules a push for reactions", async () => {
		mockToggleReaction.mockResolvedValue({ action: "added", reaction: "heart" });
		const ctx = execCtx();
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/msg-1/reactions",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reaction: "heart" }),
			}),
			env,
			ctx,
		);

		expect(res.status).toBe(200);
		expect(mockBuildPushDeps).not.toHaveBeenCalled();
		expect(mockNotifyChat).not.toHaveBeenCalled();
	});
});

// Założenia kontraktu ankiety (F2 #215):
// - POST {kind:'poll'} przechodzi tą samą ścieżką co tekst: zapis payloadu,
//   broadcast eventu "message" do wszystkich (live delivery), push w tło.
// - Walidacja union Zod: pytanie 1–200, 2–6 opcji (każda niepusta) — inaczej 400.
describe("POST /api/chat/messages — ankieta (F2 #215)", () => {
	function pollMessage() {
		return {
			id: "msg-poll",
			authorId: "u1",
			text: "Pizza w piątek?",
			kind: "poll" as const,
			payload: { options: ["Tak", "Nie"] },
			replyToId: null,
			replyText: null,
			createdAt: now,
			expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
		chatRoomStub.checkAndIncrementRateLimit.mockResolvedValue(true);
		chatRoomStub.broadcastMessage.mockResolvedValue(undefined);
		// Reset wartości z wcześniejszych describe (push sentinel) — bez ctx waitUntil rzuca.
		mockBuildPushDeps.mockReset();
	});

	it("stores the payload and broadcasts the message event to all clients", async () => {
		mockCreateMessage.mockResolvedValue(pollMessage());

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					kind: "poll",
					text: "Pizza w piątek?",
					payload: { options: ["Tak", "Nie"] },
				}),
			}),
			env,
		);

		expect(res.status).toBe(201);
		expect(mockCreateMessage).toHaveBeenCalledWith({
			authorId: "u1",
			text: "Pizza w piątek?",
			replyToId: undefined,
			kind: "poll",
			payload: { options: ["Tak", "Nie"] },
		});
		// Live delivery — istniejący event "message" (klienci dokleją po id).
		expect(chatRoomStub.broadcastMessage).toHaveBeenCalledWith(
			expect.objectContaining({ id: "msg-poll", kind: "poll" }),
		);
	});

	it("rejects fewer than 2 options with 400", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					kind: "poll",
					text: "Pytanie?",
					payload: { options: ["Tylko jedna"] },
				}),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateMessage).not.toHaveBeenCalled();
	});

	it("rejects more than 6 options with 400", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					kind: "poll",
					text: "Pytanie?",
					payload: { options: ["1", "2", "3", "4", "5", "6", "7"] },
				}),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateMessage).not.toHaveBeenCalled();
	});

	it("rejects an empty question with 400", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ kind: "poll", text: "   ", payload: { options: ["a", "b"] } }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateMessage).not.toHaveBeenCalled();
	});

	it("rejects an empty option with 400", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ kind: "poll", text: "Pytanie?", payload: { options: ["a", " "] } }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateMessage).not.toHaveBeenCalled();
	});
});

// Założenia kontraktu głosowania (F2 #215):
// - POST /messages/:id/votes → atomic upsert w domenie; broadcast vote-update
//   z samymi licznikami — GŁOSOWANIE TAJNE: payload eventu nie zawiera userId
//   ani nazwiska (AC #215). Push NIGDY nie wychodzi ze ścieżki głosów.
// - Zakres indeksu względem liczby opcji pilnuje domena (Result 400/404).
describe("POST /api/chat/messages/:id/votes (F2 #215)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("votes, broadcasts vote-update with tallies only, and returns tallies + myVote to the caller", async () => {
		// myVote: null = wycofanie (toggle po HITL); wraca TYLKO głosującemu po HTTP.
		mockVotePoll.mockResolvedValue({ ok: true, data: { tallies: [2, 1], myVote: 0 } });

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/msg-poll/votes",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ optionIndex: 0 }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockVotePoll).toHaveBeenCalledWith({
			messageId: "msg-poll",
			userId: "u1",
			optionIndex: 0,
		});
		// Broadcast bez tożsamości głosującego — dokładnie {messageId, tallies}.
		expect(chatRoomStub.broadcastEvent).toHaveBeenCalledTimes(1);
		expect(chatRoomStub.broadcastEvent).toHaveBeenCalledWith("vote-update", {
			messageId: "msg-poll",
			tallies: [2, 1],
		});
		const json = (await res.json()) as { data: { tallies: number[]; myVote: number | null } };
		expect(json.data.tallies).toEqual([2, 1]);
		expect(json.data.myVote).toBe(0);
	});

	it("returns myVote null for a retracted vote while broadcasting the new tallies", async () => {
		mockVotePoll.mockResolvedValue({ ok: true, data: { tallies: [1, 1], myVote: null } });

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/msg-poll/votes",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ optionIndex: 1 }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { tallies: number[]; myVote: number | null } };
		expect(json.data.myVote).toBeNull();
		expect(chatRoomStub.broadcastEvent).toHaveBeenCalledWith("vote-update", {
			messageId: "msg-poll",
			tallies: [1, 1],
		});
	});

	it("rejects a non-integer optionIndex with 400 (no vote, no broadcast)", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/msg-poll/votes",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ optionIndex: 1.5 }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockVotePoll).not.toHaveBeenCalled();
		expect(chatRoomStub.broadcastEvent).not.toHaveBeenCalled();
	});

	it("maps the domain Result (404 expired / 400 bad option) without broadcasting", async () => {
		mockVotePoll.mockResolvedValue({
			ok: false,
			error: new AppError("Nieprawidłowa opcja głosowania", "VALIDATION", 400),
		});

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages/msg-poll/votes",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ optionIndex: 9 }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(chatRoomStub.broadcastEvent).not.toHaveBeenCalled();
	});
});

// GET /polls — stan żywych ankiet dla sesji (mój głos + agregaty; bez nazwisk).
describe("GET /api/chat/polls (F2 #215)", () => {
	it("returns the polls state for the session user", async () => {
		const state = { myVotes: { "msg-poll": 1 }, tallies: { "msg-poll": [2, 1] } };
		mockPollsState.mockResolvedValue(state);

		const api = createApi();
		const res = await api.request("/api/chat/polls", authedRequest(), env);

		expect(res.status).toBe(200);
		expect(mockPollsState).toHaveBeenCalledWith("u1");
		const json = (await res.json()) as { data: typeof state };
		expect(json.data).toEqual(state);
	});
});

// Założenia kontraktu lokalizacji (F3 #216):
// - POST {kind:'location'} — payload {lat,lng,label?} walidowany unionem Zod
//   (zakresy geograficzne); zapis i broadcast jak zwykła wiadomość.
describe("POST /api/chat/messages — lokalizacja (F3 #216)", () => {
	function locationMessage() {
		return {
			id: "msg-loc",
			authorId: "u1",
			text: "Domek na Mazurach",
			kind: "location" as const,
			payload: { lat: 53.86, lng: 21.54, label: "Domek na Mazurach" },
			replyToId: null,
			replyText: null,
			createdAt: now,
			expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
		chatRoomStub.checkAndIncrementRateLimit.mockResolvedValue(true);
		chatRoomStub.broadcastMessage.mockResolvedValue(undefined);
		// Reset wartości z wcześniejszych describe (push sentinel) — bez ctx waitUntil rzuca.
		mockBuildPushDeps.mockReset();
	});

	it("stores the payload and broadcasts the message event", async () => {
		mockCreateMessage.mockResolvedValue(locationMessage());

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					kind: "location",
					text: "Domek na Mazurach",
					payload: { lat: 53.86, lng: 21.54, label: "Domek na Mazurach" },
				}),
			}),
			env,
		);

		expect(res.status).toBe(201);
		expect(mockCreateMessage).toHaveBeenCalledWith({
			authorId: "u1",
			text: "Domek na Mazurach",
			replyToId: undefined,
			kind: "location",
			payload: { lat: 53.86, lng: 21.54, label: "Domek na Mazurach" },
		});
		expect(chatRoomStub.broadcastMessage).toHaveBeenCalledWith(
			expect.objectContaining({ id: "msg-loc", kind: "location" }),
		);
	});

	it("rejects latitude out of range with 400", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					kind: "location",
					text: "Lokalizacja",
					payload: { lat: 91, lng: 0 },
				}),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateMessage).not.toHaveBeenCalled();
	});

	it("rejects longitude out of range with 400", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					kind: "location",
					text: "Lokalizacja",
					payload: { lat: 0, lng: -180.5 },
				}),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateMessage).not.toHaveBeenCalled();
	});

	it("rejects a malformed payload (string coords) with 400", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					kind: "location",
					text: "Lokalizacja",
					payload: { lat: "52", lng: "21" },
				}),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateMessage).not.toHaveBeenCalled();
	});
});

describe("POST /api/chat/messages — udostępnienie posta (F5 #218)", () => {
	const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
	const postEnv = { ...env, CLOUDFLARE_IMAGES_ACCOUNT_HASH: "hash123" };

	function postMessage(overrides: Record<string, unknown> = {}) {
		return {
			id: "msg-post",
			authorId: "u1",
			text: "",
			kind: "post" as const,
			payload: { postId: "p1" },
			replyToId: null,
			replyText: null,
			createdAt: now,
			expiresAt,
			...overrides,
		};
	}

	const resolvedPost = {
		id: "p1",
		authorId: "u2",
		description: "Wakacje nad morzem",
		videos: [] as never[],
		createdAt: now,
		updatedAt: now,
		author: { id: "u2", name: "Kasia" },
		images: [{ id: "i1", postId: "p1", cfImageId: "img-1", displayOrder: 0, createdAt: now }],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
		chatRoomStub.checkAndIncrementRateLimit.mockResolvedValue(true);
		chatRoomStub.broadcastMessage.mockResolvedValue(undefined);
	});

	it("creates kind='post' with an empty comment and returns the message with the resolved card", async () => {
		mockCreateMessage.mockResolvedValue(postMessage());
		mockListPostsByIds.mockResolvedValue([resolvedPost]);

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ kind: "post", payload: { postId: "p1" } }),
			}),
			postEnv,
		);

		expect(res.status).toBe(201);
		const json = (await res.json()) as { data: { kind: string; post: { thumbnailUrl: string } } };
		expect(json.data.kind).toBe("post");
		expect(json.data.post.thumbnailUrl).toContain("imagedelivery.net");
		expect(json.data.post.thumbnailUrl).toContain("hash123");
		// Broadcast też niesie gotową kartę — odbiorcy live nie dociągają nic dodatkowo.
		const broadcast = chatRoomStub.broadcastMessage.mock.calls[0]?.[0] as { post?: unknown };
		expect(broadcast.post).toBeTruthy();
	});

	it("uses the YouTube poster for video posts", async () => {
		mockCreateMessage.mockResolvedValue(postMessage());
		mockListPostsByIds.mockResolvedValue([
			{
				...resolvedPost,
				images: [],
				videos: [
					{ youtubeVideoId: "abc", title: "Wideo", thumbnailUrl: "https://i.ytimg.com/x.jpg" },
				],
			},
		]);

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ kind: "post", text: "Spójrzcie", payload: { postId: "p1" } }),
			}),
			postEnv,
		);

		expect(res.status).toBe(201);
		// Komentarz nadawcy leci do kolumny `text` (snapshot quote i tak go użyje).
		const call = mockCreateMessage.mock.calls[0]?.[0] as { text?: string };
		expect(call.text).toBe("Spójrzcie");
		const json = (await res.json()) as { data: { post: { thumbnailUrl: string } } };
		expect(json.data.post.thumbnailUrl).toBe("https://i.ytimg.com/x.jpg");
	});

	it("attaches post: null when the shared post is already deleted", async () => {
		mockCreateMessage.mockResolvedValue(postMessage());
		mockListPostsByIds.mockResolvedValue([]);

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ kind: "post", payload: { postId: "p1" } }),
			}),
			postEnv,
		);

		expect(res.status).toBe(201);
		const json = (await res.json()) as { data: { post: unknown } };
		expect(json.data.post).toBeNull();
	});
});

describe("POST /api/chat/messages — załączniki (F4 #217)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
		chatRoomStub.checkAndIncrementRateLimit.mockResolvedValue(true);
		chatRoomStub.broadcastMessage.mockResolvedValue(undefined);
	});

	it("stores metadata payload and creates ONE message for text + attachments", async () => {
		const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
		mockCreateMessage.mockResolvedValue({
			id: "msg-att",
			authorId: "u1",
			text: "Dokumenty z notariusza",
			kind: "attachments",
			payload: {
				attachments: [
					{
						key: "9f8c2b1a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
						name: "umowa.pdf",
						size: 2048,
						mimeType: "application/pdf",
					},
				],
			},
			replyToId: null,
			replyText: null,
			createdAt: now,
			expiresAt,
		});

		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					kind: "attachments",
					text: "Dokumenty z notariusza",
					payload: {
						attachments: [
							{
								key: "9f8c2b1a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
								name: "umowa.pdf",
								size: 2048,
								mimeType: "application/pdf",
							},
						],
					},
				}),
			}),
			env,
		);

		expect(res.status).toBe(201);
		// JEDNO wywołanie createChatMessage — tekst i załączniki lecą razem (AC #217).
		expect(mockCreateMessage).toHaveBeenCalledTimes(1);
	});

	it("rejects a video attachment in the payload with 400", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/chat/messages",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					kind: "attachments",
					payload: {
						attachments: [
							{
								key: "9f8c2b1a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
								name: "film.mp4",
								size: 100,
								mimeType: "video/mp4",
							},
						],
					},
				}),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateMessage).not.toHaveBeenCalled();
	});
});

describe("GET /api/chat/messages — karty udostępnionych postów (F5 #218)", () => {
	const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
	const postEnv = { ...env, CLOUDFLARE_IMAGES_ACCOUNT_HASH: "hash123" };

	function postListItem() {
		return {
			id: "msg-post",
			authorId: "u2",
			text: "Zobaczcie",
			kind: "post" as const,
			payload: { postId: "p1" },
			replyToId: null,
			replyText: null,
			createdAt: now,
			expiresAt,
			author: { id: "u2", name: "Kasia" },
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("resolves the card for a live post on every read (edycje widoczne od razu)", async () => {
		mockListMessages.mockResolvedValue([postListItem()]);
		mockListPostsByIds.mockResolvedValue([
			{
				id: "p1",
				authorId: "u2",
				description: "Opis posta",
				videos: [] as never[],
				createdAt: now,
				updatedAt: now,
				author: { id: "u2", name: "Kasia" },
				images: [{ id: "i1", postId: "p1", cfImageId: "img-1", displayOrder: 0, createdAt: now }],
			},
		]);

		const api = createApi();
		const res = await api.request("/api/chat/messages", authedRequest(), postEnv);

		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			data: Array<{ kind: string; post: { snippet: string; authorName: string } | null }>;
		};
		expect(json.data[0]?.post).toMatchObject({ snippet: "Opis posta", authorName: "Kasia" });
	});

	it("attaches post: null for a deleted post (placeholder zamiast martwego linku)", async () => {
		mockListMessages.mockResolvedValue([postListItem()]);
		mockListPostsByIds.mockResolvedValue([]);

		const api = createApi();
		const res = await api.request("/api/chat/messages", authedRequest(), postEnv);

		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: Array<{ post: unknown }> };
		expect(json.data[0]?.post).toBeNull();
	});

	it("skips the posts lookup entirely when no post messages exist", async () => {
		mockListMessages.mockResolvedValue([
			{
				id: "msg-1",
				authorId: "u2",
				text: "Cześć",
				kind: "text",
				payload: null,
				replyToId: null,
				replyText: null,
				createdAt: now,
				expiresAt,
				author: { id: "u2", name: "Kasia" },
			},
		]);

		const api = createApi();
		const res = await api.request("/api/chat/messages", authedRequest(), postEnv);

		expect(res.status).toBe(200);
		expect(mockListPostsByIds).not.toHaveBeenCalled();
	});
});

describe("GET /api/chat/share-preview/:id (F5 #218)", () => {
	const postEnv = { ...env, CLOUDFLARE_IMAGES_ACCOUNT_HASH: "hash123" };

	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("returns the preview card for a live post", async () => {
		mockListPostsByIds.mockResolvedValue([
			{
				id: "p1",
				authorId: "u2",
				description: "Krótki opis",
				videos: [] as never[],
				createdAt: now,
				updatedAt: now,
				author: { id: "u2", name: "Kasia" },
				images: [{ id: "i1", postId: "p1", cfImageId: "img-1", displayOrder: 0, createdAt: now }],
			},
		]);

		const api = createApi();
		const res = await api.request("/api/chat/share-preview/p1", authedRequest(), postEnv);

		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			data: { id: string; snippet: string; authorName: string; thumbnailUrl: string };
		};
		expect(json.data).toMatchObject({
			id: "p1",
			snippet: "Krótki opis",
			authorName: "Kasia",
			thumbnailUrl: expect.stringContaining("imagedelivery.net"),
		});
	});

	it("returns 404 for a deleted post (draft zrzucany po stronie klienta)", async () => {
		mockListPostsByIds.mockResolvedValue([]);
		const api = createApi();
		const res = await api.request("/api/chat/share-preview/p1", authedRequest(), postEnv);
		expect(res.status).toBe(404);
	});
});
