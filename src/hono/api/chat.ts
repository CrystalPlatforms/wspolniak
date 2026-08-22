// SPDX-License-Identifier: AGPL-3.0-or-later
import { createChatMessage, createChatMessageSchema, listChatMessages } from "@/db/chat";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";

const chatEndpoint = createHono();

chatEndpoint.use("*", authMiddleware());

// POST /messages — wyślij wiadomość (autor zawsze z sesji; limit 200 znaków w Zod).
chatEndpoint.post("/messages", async (c) => {
	const user = c.get("user");
	const parsed = createChatMessageSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
	}

	const message = await createChatMessage({ authorId: user.userId, text: parsed.data.text });
	// Autor znany z sesji — bez dodatkowego odczytu z DB; pełny kształt jak w GET.
	return c.json({ data: { ...message, author: { id: user.userId, name: user.name } } }, 201);
});

// GET /messages — wiadomości z ostatnich 24h z autorami (filtr expires_at w domenie).
chatEndpoint.get("/messages", async (c) => {
	const messages = await listChatMessages();
	return c.json({ data: messages });
});

export default chatEndpoint;
