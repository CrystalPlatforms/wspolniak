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
		Bindings: { SESSION_SECRET: string };
	}>().basePath("/api");
	api.route("/chat", chatEndpoint);
	return api;
}

const env = { SESSION_SECRET: "secret" };

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
