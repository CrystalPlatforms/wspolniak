// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { AppError, type Result } from "@/core/errors";
import { users } from "@/db/identity/table";
import type { ReactionType } from "@/db/post-reactions/table";
import { getDb } from "@/db/setup";
import { chatMessages, chatReactions } from "./table";

export type ChatMessage = InferSelectModel<typeof chatMessages>;

/** Wiadomość czatu z nazwą autora (join z users) — kształt zwracany przez API. */
export interface ChatMessageWithAuthor {
	id: string;
	authorId: string;
	text: string;
	replyToId: string | null;
	replyText: string | null;
	createdAt: Date;
	expiresAt: Date;
	author: { id: string; name: string };
}

/**
 * Wysyła wiadomość (F1 #152); z reply (F5 #156) — `replyToId` wskazuje oryginał.
 * Serwer **snapshottuje** tekst oryginału do `replyText` w momencie wysłania:
 * quote przeżywa wygaśnięcie/usunięcie oryginału. Odpowiedź na nieistniejący
 * lub wygasły oryginał → AppError 400 (walidacja na granicy domeny).
 */
export async function createChatMessage(input: {
	authorId: string;
	text: string;
	replyToId?: string;
}): Promise<ChatMessage> {
	let replyText: string | null = null;
	if (input.replyToId) {
		const originals = await getDb()
			.select({ text: chatMessages.text })
			.from(chatMessages)
			.where(and(eq(chatMessages.id, input.replyToId), gt(chatMessages.expiresAt, new Date())))
			.limit(1);
		const original = originals[0];
		if (!original) {
			throw new AppError(
				"Nie można odpowiedzieć na tę wiadomość — nie istnieje lub wygasła",
				"VALIDATION",
				400,
			);
		}
		replyText = original.text;
	}

	const rows = await getDb()
		.insert(chatMessages)
		.values({ id: crypto.randomUUID(), ...input, replyText })
		.returning();

	const row = rows[0];
	if (!row) throw new Error("createChatMessage: insert returned no rows");
	return row;
}

/** Wiadomości z ostatnich 24h z autorami, chronologicznie. Zawsze filtruje expires_at > now(). */
export async function listChatMessages(): Promise<ChatMessageWithAuthor[]> {
	const rows = await getDb()
		.select({
			message: chatMessages,
			author: { id: users.id, name: users.name },
		})
		.from(chatMessages)
		.leftJoin(users, eq(chatMessages.authorId, users.id))
		.where(gt(chatMessages.expiresAt, new Date()))
		.orderBy(asc(chatMessages.createdAt));

	return rows.map((row) => ({
		id: row.message.id,
		authorId: row.message.authorId,
		text: row.message.text,
		replyToId: row.message.replyToId,
		replyText: row.message.replyText,
		createdAt: row.message.createdAt,
		expiresAt: row.message.expiresAt,
		author: { id: row.author?.id ?? "", name: row.author?.name ?? "" },
	}));
}

/** Reakcja na wiadomość czatu z imieniem usera — kształt API i klienta (F4 #155). */
export interface ChatReactionWithUser {
	messageId: string;
	userId: string;
	reaction: ReactionType;
	user: { id: string; name: string } | null;
}

/** Wynik toggle: dodano / usunięto / zastąpiono inny typ (previous = stary typ). */
export type ChatReactionAction = "added" | "removed" | "replaced";

/** Szczegóły wyniku toggle'u — sterują broadcastem i optymistycznym UI. */
export interface ToggleChatReactionResult {
	action: ChatReactionAction;
	/** Efektywna reakcja po toggle'u (przy "removed" — ta usunięta). */
	reaction: ReactionType;
	/** Przy "replaced": typ zastąpiony (klient musi go zdjąć). */
	previous?: ReactionType;
}

/**
 * Toggle reakcji w jednej operacji (F4 #155) z limitem **jednej reakcji na usera
 * na wiadomość** (jak w feedzie, decyzja usera po HITL). Delete-first: kasuje
 * wiersz usera dla wiadomości (dowolny typ) → ten sam typ = "removed"; inny typ
 * = "replaced" (INSERT nowego, previous = stary); brak = "added".
 * onConflictDoNothing — UNIQUE(message,user) nigdy nie wycieka błędem (wyścigi
 * kończą się jednym wierszem).
 */
export async function toggleChatReaction(input: {
	messageId: string;
	userId: string;
	reaction: ReactionType;
}): Promise<ToggleChatReactionResult> {
	const db = getDb();

	const deleted = await db
		.delete(chatReactions)
		.where(
			and(eq(chatReactions.messageId, input.messageId), eq(chatReactions.userId, input.userId)),
		)
		.returning();
	const existing = deleted[0];

	if (existing && existing.reaction === input.reaction) {
		return { action: "removed", reaction: input.reaction };
	}

	await db
		.insert(chatReactions)
		.values({ id: crypto.randomUUID(), ...input })
		.onConflictDoNothing();
	return existing
		? { action: "replaced", reaction: input.reaction, previous: existing.reaction as ReactionType }
		: { action: "added", reaction: input.reaction };
}

/**
 * Reakcje widocznych (niewygasłych) wiadomości z imionami — inner join z
 * chat_messages + expires_at > now() zawsze w SQL; wygasłe nie zwracają reakcji.
 */
export async function listChatReactions(): Promise<ChatReactionWithUser[]> {
	const rows = await getDb()
		.select({ reaction: chatReactions, userName: users.name })
		.from(chatReactions)
		.innerJoin(chatMessages, eq(chatReactions.messageId, chatMessages.id))
		.leftJoin(users, eq(chatReactions.userId, users.id))
		.where(gt(chatMessages.expiresAt, new Date()));

	return rows.map((row) => ({
		messageId: row.reaction.messageId,
		userId: row.reaction.userId,
		reaction: row.reaction.reaction as ReactionType,
		user: row.userName ? { id: row.reaction.userId, name: row.userName } : null,
	}));
}

/**
 * Usuwa wiadomość dla wszystkich (F6 #157). Autoryzacja: **autor** lub **admin**;
 * kto inny → Result error 403 (odpowiedź nie zdradza treści), brak wiadomości →
 * 404. Hard delete wiadomości **i jej reakcji w jednym zapytaniu SQL** (CTE) —
 * atomowe i jedno round-trip na serverless driverze. Odpowiedzi na usuniętą
 * wiadomość zachowują snapshot quote (kaskada ich nie dotyka).
 */
export async function deleteChatMessage(input: {
	id: string;
	requesterId: string;
	requesterRole: string;
}): Promise<Result<void>> {
	const rows = await getDb()
		.select({ authorId: chatMessages.authorId })
		.from(chatMessages)
		.where(eq(chatMessages.id, input.id))
		.limit(1);

	const row = rows[0];
	if (!row) {
		return {
			ok: false,
			error: new AppError("Wiadomość nie istnieje", "NOT_FOUND", 404),
		};
	}
	if (row.authorId !== input.requesterId && input.requesterRole !== "admin") {
		return {
			ok: false,
			error: new AppError("Nie możesz usunąć tej wiadomości", "UNAUTHORIZED", 403),
		};
	}

	await getDb().execute(sql`
		with deleted as (
			delete from chat_messages where id = ${input.id} returning id
		)
		delete from chat_reactions where message_id in (select id from deleted)
	`);
	return { ok: true, data: undefined };
}
