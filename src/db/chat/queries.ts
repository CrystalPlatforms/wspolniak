// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { AppError, type Result } from "@/core/errors";
import { users } from "@/db/identity/table";
import type { ReactionType } from "@/db/post-reactions/table";
import { getDb } from "@/db/setup";
import { type ChatMessageKind, type ChatMessagePayload, pollPayloadSchema } from "./schema";
import { chatMessages, chatPollVotes, chatReactions } from "./table";

export type ChatMessage = InferSelectModel<typeof chatMessages>;

/** Wiadomość czatu z nazwą autora (join z users) — kształt zwracany przez API. */
export interface ChatMessageWithAuthor {
	id: string;
	authorId: string;
	text: string;
	kind: ChatMessageKind;
	payload: ChatMessagePayload | null;
	replyToId: string | null;
	replyText: string | null;
	createdAt: Date;
	expiresAt: Date;
	author: { id: string; name: string };
}

/**
 * Wysyła wiadomość (F1 #152); z reply (F5 #156) — `replyToId` wskazuje oryginał.
 * F2 #215: `kind` (default 'text') + `payload` dla typów bogatych (ankieta).
 * Serwer **snapshottuje** tekst oryginału do `replyText` w momencie wysłania:
 * quote przeżywa wygaśnięcie/usunięcie oryginału. Odpowiedź na nieistniejący
 * lub wygasły oryginał → AppError 400 (walidacja na granicy domeny).
 */
export async function createChatMessage(input: {
	authorId: string;
	text: string;
	replyToId?: string;
	kind?: ChatMessageKind;
	payload?: ChatMessagePayload;
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
		kind: row.message.kind,
		payload: row.message.payload,
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
 * Cron czyszczenia (F7 #158): kasuje wygasłe wiadomości (`expires_at < now()`)
 * razem z ich reakcjami i głosami ankiet w JEDNYM zapytaniu (CTE — wzorzec
 * deleteChatMessage, jeden round-trip na serverless driverze). Zwraca liczbę
 * skasowanych wiadomości — pod log crona. Read path (GET) i tak zawsze filtruje
 * wygasłe w SQL, więc cron odchudza tylko tabelę, nie chroni poprawności odpowiedzi.
 */
export async function deleteExpiredChatMessages(): Promise<number> {
	const result = await getDb().execute(sql`
    with deleted as (
      delete from chat_messages where expires_at < now() returning id
    ), reactions_gone as (
      delete from chat_reactions where message_id in (select id from deleted)
    ), votes_gone as (
      delete from chat_poll_votes where message_id in (select id from deleted)
    )
    select count(*)::int as deleted from deleted
  `);
	const rows = (result as { rows?: { deleted?: number }[] }).rows ?? [];
	return rows[0]?.deleted ?? 0;
}

/**
 * Usuwa wiadomość dla wszystkich (F6 #157). Autoryzacja: **autor** lub **admin**;
 * kto inny → Result error 403 (odpowiedź nie zdradza treści), brak wiadomości →
 * 404. Hard delete wiadomości **i jej reakcji/głosów w jednym zapytaniu SQL**
 * (CTE) — atomowe i jedno round-trip na serverless driverze. Odpowiedzi na
 * usuniętą wiadomość zachowują snapshot quote (kaskada ich nie dotyka).
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
		), votes_gone as (
			delete from chat_poll_votes where message_id in (select id from deleted)
		)
		delete from chat_reactions where message_id in (select id from deleted)
	`);
	return { ok: true, data: undefined };
}

/**
 * Zagregowane liczniki głosów ankiety — tablica długości `optionCount`
 * (brak głosów na opcję = 0). Głosy zagubione (np. po edycji ankiety — dziś
 * niemożliwe) poza zakresem są ignorowane, nie wysypują odpowiedzi.
 */
export async function getChatPollTallies(messageId: string, optionCount: number): Promise<number[]> {
	const rows = await getDb()
		.select({
			optionIndex: chatPollVotes.optionIndex,
			votes: sql<number>`count(*)::int`,
		})
		.from(chatPollVotes)
		.where(eq(chatPollVotes.messageId, messageId))
		.groupBy(chatPollVotes.optionIndex);

	const tallies = Array.from({ length: optionCount }, () => 0);
	for (const row of rows) {
		if (row.optionIndex >= 0 && row.optionIndex < optionCount) {
			tallies[row.optionIndex] = row.votes;
		}
	}
	return tallies;
}

/**
 * Oddaje / zmienia / **wycofuje** głos w ankiecie (F2 #215; toggle po HITL):
 * - klik w nową opcję = **atomic upsert** po UNIQUE(message_id, user_id) —
 *   na głosującego przypadają zawsze dokładnie 1 wiersz i 1 głos;
 * - ponowny klik w TĘ SAMĄ opcję = DELETE wiersza (głos znikaje, procenty spadają).
 * Głosowanie tajne — zwracamy wyłącznie agregaty i głos WYWOŁUJĄCEGO (myVote,
 * potrzebny jego klientowi do podświetlenia; nigdy tożsamości innych).
 * Żywa ankieta `kind = 'poll'` + indeks w zakresie opcji, inaczej Result 404/400.
 */
export async function voteChatPoll(input: {
	messageId: string;
	userId: string;
	optionIndex: number;
}): Promise<Result<{ tallies: number[]; myVote: number | null }>> {
	const polls = await getDb()
		.select({ kind: chatMessages.kind, payload: chatMessages.payload })
		.from(chatMessages)
		.where(and(eq(chatMessages.id, input.messageId), gt(chatMessages.expiresAt, new Date())))
		.limit(1);
	const poll = polls[0];
	if (!poll) {
		return { ok: false, error: new AppError("Ankieta nie istnieje lub wygasła", "NOT_FOUND", 404) };
	}
	if (poll.kind !== "poll") {
		return { ok: false, error: new AppError("Ta wiadomość nie jest ankietą", "VALIDATION", 400) };
	}
	const parsed = pollPayloadSchema.safeParse(poll.payload);
	if (!parsed.success || input.optionIndex >= parsed.data.options.length) {
		return { ok: false, error: new AppError("Nieprawidłowa opcja głosowania", "VALIDATION", 400) };
	}

	const current = await getDb()
		.select({ optionIndex: chatPollVotes.optionIndex })
		.from(chatPollVotes)
		.where(and(eq(chatPollVotes.messageId, input.messageId), eq(chatPollVotes.userId, input.userId)))
		.limit(1);
	const existing = current[0];

	if (existing && existing.optionIndex === input.optionIndex) {
		// Toggle: ten sam głos drugi raz = wycofanie (usuwa wiersz).
		await getDb()
			.delete(chatPollVotes)
			.where(
				and(
					eq(chatPollVotes.messageId, input.messageId),
					eq(chatPollVotes.userId, input.userId),
				),
			);
		const tallies = await getChatPollTallies(input.messageId, parsed.data.options.length);
		return { ok: true, data: { tallies, myVote: null } };
	}

	await getDb()
		.insert(chatPollVotes)
		.values({
			id: crypto.randomUUID(),
			messageId: input.messageId,
			userId: input.userId,
			optionIndex: input.optionIndex,
		})
		// Zmiana głosu = podmiana indeksu po UNIQUE(message_id, user_id) — atomowo,
		// bez read-before-write i bez wyścigów (drugi insert tego samego usera
		// trafia w conflict i robi UPDATE).
		.onConflictDoUpdate({
			target: [chatPollVotes.messageId, chatPollVotes.userId],
			set: { optionIndex: input.optionIndex },
		});

	const tallies = await getChatPollTallies(input.messageId, parsed.data.options.length);
	return { ok: true, data: { tallies, myVote: input.optionIndex } };
}

/** Stan ankiet dla klienta (F2 #215): mój głos + zagregowane liczniki żywych ankiet. */
export interface ChatPollsState {
	/** messageId → indeks opcji wybrany przez zalogowanego (brak klucza = bez głosu). */
	myVotes: Record<string, number>;
	/** messageId → liczba głosów per opcja (indeks tablicy = opcja). */
	tallies: Record<string, number[]>;
}

/**
 * Stan WSZYSTKICH żywych ankiet w dwóch zapytaniach (sonda + głosy). Głosy czyta
 * z userId **tylko** po to, by wyznaczyć „mój głos" — do klienta wychodzą same
 * liczniki (głosowanie tajne, AC #215: nazwiska nigdzie w UI/payloadach).
 */
export async function getChatPollsState(viewerId: string): Promise<ChatPollsState> {
	const polls = await getDb()
		.select({ id: chatMessages.id, payload: chatMessages.payload })
		.from(chatMessages)
		.where(and(eq(chatMessages.kind, "poll"), gt(chatMessages.expiresAt, new Date())));

	const state: ChatPollsState = { myVotes: {}, tallies: {} };
	if (polls.length === 0) return state;

	const optionCounts = new Map<string, number>();
	for (const poll of polls) {
		const parsed = pollPayloadSchema.safeParse(poll.payload);
		if (!parsed.success) continue; // uszkodzony payload — ankieta bez liczników, nie wysypuje listy
		optionCounts.set(poll.id, parsed.data.options.length);
	}

	const votes = await getDb()
		.select({
			messageId: chatPollVotes.messageId,
			userId: chatPollVotes.userId,
			optionIndex: chatPollVotes.optionIndex,
		})
		.from(chatPollVotes)
		.where(
			inArray(
				chatPollVotes.messageId,
				polls.map((poll) => poll.id),
			),
		);

	for (const vote of votes) {
		const optionCount = optionCounts.get(vote.messageId);
		if (optionCount === undefined) continue;
		if (vote.optionIndex < 0 || vote.optionIndex >= optionCount) continue;
		let tallies = state.tallies[vote.messageId];
		if (!tallies) {
			tallies = Array.from({ length: optionCount }, () => 0);
			state.tallies[vote.messageId] = tallies;
		}
		tallies[vote.optionIndex] += 1;
		if (vote.userId === viewerId) {
			state.myVotes[vote.messageId] = vote.optionIndex;
		}
	}
	return state;
}
