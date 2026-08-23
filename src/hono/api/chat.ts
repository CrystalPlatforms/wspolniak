// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "@/core/errors";
import {
	createChatMessage,
	createChatMessageSchema,
	deleteChatMessage,
	listChatMessages,
	listChatReactions,
	toggleChatReaction,
	toggleChatReactionSchema,
} from "@/db/chat";
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

	try {
		const message = await createChatMessage({
			authorId: user.userId,
			text: parsed.data.text,
			replyToId: parsed.data.replyToId,
		});
		// Autor znany z sesji — bez dodatkowego odczytu z DB; pełny kształt jak w GET.
		const messageWithAuthor = { ...message, author: { id: user.userId, name: user.name } };
		await room.broadcastMessage(messageWithAuthor);
		return c.json({ data: messageWithAuthor }, 201);
	} catch (error) {
		// Reply na nieistniejący/wygasły oryginał (F5 #156) — znany błąd domeny → 400.
		if (error instanceof AppError) {
			return c.json({ error: error.message }, error.status as ContentfulStatusCode);
		}
		throw error;
	}
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

// POST /messages/:id/reactions (F4 #155) — toggle add/remove w jednej mutacji
// (user zawsze z sesji, typ z Zod — nieznany → 400). Po zapisie broadcast eventu
// "reaction" z autorem zmiany (imię potrzebne klientowi do listy kto-zareagował).
chatEndpoint.post("/messages/:id/reactions", async (c) => {
	const user = c.get("user");
	const parsed = toggleChatReactionSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
	}

	const messageId = c.req.param("id");
	const result = await toggleChatReaction({
		messageId,
		userId: user.userId,
		reaction: parsed.data.reaction,
	});

	const room = c.env.CHAT_ROOM.get(c.env.CHAT_ROOM.idFromName("global"));
	const reactor = { id: user.userId, name: user.name };
	// Replace = dwa eventy (removed starego + added nowego) — klient aplikuje je
	// bez zmian przez applyReactionEvent; pojedyncze akcje = jeden event.
	if (result.action === "replaced" && result.previous) {
		await room.broadcastEvent("reaction", {
			messageId,
			reaction: result.previous,
			action: "removed",
			user: reactor,
		});
	}
	await room.broadcastEvent("reaction", {
		messageId,
		reaction: result.reaction,
		action: result.action === "removed" ? "removed" : "added",
		user: reactor,
	});
	return c.json({ data: { action: result.action } });
});

// GET /reactions (F4 #155) — wszystkie reakcje widocznych wiadomości z imionami.
chatEndpoint.get("/reactions", async (c) => {
	const reactions = await listChatReactions();
	return c.json({ data: reactions });
});

// DELETE /messages/:id (F6 #157) — usuń dla wszystkich: tylko autor lub admin
// (Result z domeny: 404 nie istnieje / 403 cudza wiadomość — bez treści w odpowiedzi).
// Po kasie broadcast "delete" — klienci animują zniknięcie bąbelka bez odświeżania.
chatEndpoint.delete("/messages/:id", async (c) => {
	const user = c.get("user");
	const messageId = c.req.param("id");

	const result = await deleteChatMessage({
		id: messageId,
		requesterId: user.userId,
		requesterRole: user.role,
	});
	if (!result.ok) {
		return c.json({ error: result.error.message }, result.error.status as ContentfulStatusCode);
	}

	const room = c.env.CHAT_ROOM.get(c.env.CHAT_ROOM.idFromName("global"));
	await room.broadcastEvent("delete", { messageId });
	return c.json({ data: { ok: true } });
});

export default chatEndpoint;
