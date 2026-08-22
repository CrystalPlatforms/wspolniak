// SPDX-License-Identifier: AGPL-3.0-or-later
import { createChatMessage, createChatMessageSchema, listChatMessages } from "@/db/chat";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";

const chatEndpoint = createHono();

chatEndpoint.use("*", authMiddleware());

// POST /messages — wyślij wiadomość (autor zawsze z sesji; limit 200 znaków w Zod).
// Anty-spam PRZED zapisem (check-and-increment w DO), broadcast PO zapisie.
chatEndpoint.post("/messages", async (c) => {
	const user = c.get("user");
	const parsed = createChatMessageSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
	}

	const room = c.env.CHAT_ROOM.get(c.env.CHAT_ROOM.idFromName("global"));
	const allowed = await room.checkAndIncrementRateLimit(user.userId);
	if (!allowed) {
		return c.json({ error: "Too many messages" }, 429);
	}

	const message = await createChatMessage({ authorId: user.userId, text: parsed.data.text });
	// Autor znany z sesji — bez dodatkowego odczytu z DB; pełny kształt jak w GET.
	const messageWithAuthor = { ...message, author: { id: user.userId, name: user.name } };
	await room.broadcastMessage(messageWithAuthor);
	return c.json({ data: messageWithAuthor }, 201);
});

// GET /ws — upgrade WebSocketu (odbiór + typing; wysyłka zawsze przez POST).
// Tożsamość zweryfikowana przez authMiddleware z use("*") → DO dostaje zaufany nagłówek.
chatEndpoint.get("/ws", async (c) => {
	const user = c.get("user");
	const room = c.env.CHAT_ROOM.get(c.env.CHAT_ROOM.idFromName("global"));
	const forward = new Request(c.req.raw.url, c.req.raw);
	forward.headers.set("x-chat-user-id", user.userId);
	return room.fetch(forward);
});

// GET /messages — wiadomości z ostatnich 24h z autorami (filtr expires_at w domenie).
chatEndpoint.get("/messages", async (c) => {
	const messages = await listChatMessages();
	return c.json({ data: messages });
});

export default chatEndpoint;
