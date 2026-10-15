// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "@/core/errors";
import { notifyChatMessage } from "@/core/notify";
import { buildPushDeps } from "@/core/push-deps";
import {
	type ChatMessageWithAuthor,
	createChatMessage,
	createChatMessageSchema,
	deleteChatMessage,
	getChatPollsState,
	listChatMessages,
	listChatReactions,
	postPayloadSchema,
	toggleChatReaction,
	toggleChatReactionSchema,
	voteChatPoll,
	voteChatPollSchema,
} from "@/db/chat";
import { listPostsByIds } from "@/db/posts";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";
import { getImageUrl } from "@/images/client";

const chatEndpoint = createHono();

chatEndpoint.use("*", authMiddleware());

/** Długość wycinka opisu na karcie udostępnionego posta (F5 #218) — 1–2 linijki. */
const POST_SNIPPET_MAX_LENGTH = 140;

/** Karta udostępnionego posta (F5 #218) — resolwowana z id posta przy każdym odczycie. */
interface ChatPostPreview {
	id: string;
	snippet: string;
	authorName: string;
	/** Miniatura: zdjęcie z Cloudflare Images albo poster z YouTube (posty wideo); null = post bez mediów. */
	thumbnailUrl: string | null;
}

/** Wiadomość z doklejonym (lub wygasłym → null) podglądem posta — tylko dla kind = 'post'. */
type ChatMessageWithPreview = ChatMessageWithAuthor & { post?: ChatPostPreview | null };

/** Wycinek opisu posta do karty — miniatura → poster wideo → null (post bez mediów). */
function postPreviewOf(
	post: Awaited<ReturnType<typeof listPostsByIds>>[number],
	imageAccountHash: string,
): ChatPostPreview {
	const image = post.images[0];
	const video = post.videos[0];
	return {
		id: post.id,
		snippet: (post.description ?? "").slice(0, POST_SNIPPET_MAX_LENGTH),
		authorName: post.author.name,
		thumbnailUrl: image
			? getImageUrl({
					accountHash: imageAccountHash,
					cfImageId: image.cfImageId,
					variant: "thumbnail",
				})
			: (video?.thumbnailUrl ?? null),
	};
}

/**
 * Dokleja `post` do wiadomości kind='post' (F5 #218): payload niesie samo id,
 * więc karta ODŚWIEŻA się przy każdym pobraniu — edycje i usunięcia posta
 * widoczne od razu. Post usunięty/nieistniejący → `post: null` (placeholder
 * „Post usunięty" zamiast martwego linku). Uszkodzony payload zostaje bez karty.
 */
async function attachPostPreviews(
	messages: ChatMessageWithAuthor[],
	imageAccountHash: string,
): Promise<ChatMessageWithPreview[]> {
	const postIds = new Set<string>();
	for (const message of messages) {
		if (message.kind !== "post") continue;
		const parsed = postPayloadSchema.safeParse(message.payload);
		if (parsed.success) postIds.add(parsed.data.postId);
	}
	if (postIds.size === 0) return messages;

	const posts = await listPostsByIds([...postIds]);
	const previews = new Map<string, ChatPostPreview>();
	for (const post of posts) {
		previews.set(post.id, postPreviewOf(post, imageAccountHash));
	}

	return messages.map((message) => {
		if (message.kind !== "post") return message;
		const parsed = postPayloadSchema.safeParse(message.payload);
		if (!parsed.success) return message;
		return { ...message, post: previews.get(parsed.data.postId) ?? null };
	});
}

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
			// F2 #215 / F3 #216: payload dla typów bogatych — union Zod gwarantuje kształt.
			kind: parsed.data.kind,
			payload: parsed.data.kind === "text" ? undefined : parsed.data.payload,
		});
		// Autor znany z sesji — bez dodatkowego odczytu z DB; pełny kształt jak w GET.
		const messageWithAuthor = { ...message, author: { id: user.userId, name: user.name } };
		// Karta posta (F5 #218) resolwowana też przy wysyłce — nadawca i odbiorcy
		// (broadcast WS) dostają gotową kartę bez dodatkowego round-tripa.
		const [messageWithPreview] = await attachPostPreviews(
			[messageWithAuthor],
			c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH,
		);
		await room.broadcastMessage(messageWithPreview);
		// Push do niepodłączonych (F7 #158) — w tle (waitUntil), błąd pusha nie
		// psuje wysyłki; VAPID-off → buildPushDeps null → bez pusha. Reakcje
		// i typing NIGDY nie pushują (ta ścieżka istnieje tylko tutaj).
		const pushDeps = buildPushDeps(c.env, message.id, "chat");
		if (pushDeps) {
			c.executionCtx.waitUntil(notifyChatMessage(pushDeps, room, user.userId));
		}
		return c.json({ data: messageWithPreview }, 201);
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
// Karty udostępnionych postów (F5 #218) resolwowane przy każdym odczycie —
// usunięty post przychodzi jako `post: null`.
chatEndpoint.get("/messages", async (c) => {
	const messages = await listChatMessages();
	const data = await attachPostPreviews(messages, c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH);
	return c.json({ data });
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

// POST /messages/:id/votes (F2 #215) — oddaj/zmień głos w ankiecie (atomic upsert
// w domenie: jeden wiersz na głosującego). Zakres opcji waliduje domena wobec
// payloadu. Broadcast **vote-update** z samymi licznikami — głosowanie tajne,
// tożsamość głosującego nigdy nie opuszcza serwera.
chatEndpoint.post("/messages/:id/votes", async (c) => {
	const user = c.get("user");
	const parsed = voteChatPollSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
	}

	const messageId = c.req.param("id");
	const result = await voteChatPoll({
		messageId,
		userId: user.userId,
		optionIndex: parsed.data.optionIndex,
	});
	if (!result.ok) {
		return c.json({ error: result.error.message }, result.error.status as ContentfulStatusCode);
	}

	const room = c.env.CHAT_ROOM.get(c.env.CHAT_ROOM.idFromName("global"));
	// Broadcast dalej bez tożsamości (sekretna kula); `myVote` (null = wycofany)
	// wraca TYLKO głosującemu po HTTP — jego klient podświetla opcję.
	await room.broadcastEvent("vote-update", { messageId, tallies: result.data.tallies });
	return c.json({ data: { tallies: result.data.tallies, myVote: result.data.myVote } });
});

// GET /polls (F2 #215) — stan żywych ankiet dla zalogowanego: jego głosy +
// zagregowane liczniki. Bez tożsamości innych głosujących (sekretna kula).
chatEndpoint.get("/polls", async (c) => {
	const user = c.get("user");
	const state = await getChatPollsState(user.userId);
	return c.json({ data: state });
});

// GET /share-preview/:id (F5 #218) — podgląd posta dla draftu w composerze
// (miniatura + wycinek + autor). Post usunięty/nieistniejący → 404: draft
// jest wtedy zrzucany po stronie klienta, zanim cokolwiek wyśle.
chatEndpoint.get("/share-preview/:id", async (c) => {
	const postId = c.req.param("id");
	const posts = await listPostsByIds([postId]);
	const post = posts[0];
	if (!post) {
		return c.json({ error: "Post nie istnieje" }, 404);
	}
	return c.json({ data: postPreviewOf(post, c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH) });
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
