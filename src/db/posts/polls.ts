// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { AppError, type Result } from "@/core/errors";
import { getDb } from "@/db/setup";
import type { PostPollPayload } from "./schema";
import { postPollSchema } from "./schema";
import { postPollVotes, posts } from "./table";

/** Wyniki ankiety dla klienta — same liczniki, bez tożsamości głosujących. */
export interface PostPollResults {
	counts: number[];
	/** Głos wywołującego (null = nie głosował) — potrzebny UX „zmień głos". */
	myVoteIndex: number | null;
}

/**
 * Oddaje albo zmienia głos w ankiecie posta (#241):
 * atomowy upsert po UNIQUE(post_id, user_id), więc zmiana głosu to podmiana
 * indeksu — nigdy 2 wiersze i nigdy błąd unique. Klik w TĘ SAMĄ opcję jest
 * idempotentny (ankiety postów nie mają wycofywania głosu — decyzja PRD #240).
 * Głosowanie tajne: zwracamy wyłącznie liczniki i głos WYWOŁUJĄCEGO.
 * Post musi istnieć (nie usunięty) i mieć ankietę, a indeks musi mieścić się
 * w zakresie jej opcji — inaczej Result 404/400.
 */
export async function voteOnPostPoll(
	postId: string,
	userId: string,
	optionIndex: number,
): Promise<Result<PostPollResults>> {
	const rows = await getDb()
		.select({ poll: posts.poll })
		.from(posts)
		.where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
		.limit(1);
	const row = rows[0];
	if (!row) {
		return { ok: false, error: new AppError("Post nie istnieje", "NOT_FOUND", 404) };
	}
	if (!row.poll) {
		return { ok: false, error: new AppError("Ten post nie ma ankiety", "VALIDATION", 400) };
	}
	const parsed = postPollSchema.safeParse(row.poll);
	if (!parsed.success || optionIndex >= parsed.data.options.length) {
		return { ok: false, error: new AppError("Nieprawidłowa opcja głosowania", "VALIDATION", 400) };
	}

	await getDb()
		.insert(postPollVotes)
		.values({ id: crypto.randomUUID(), postId, userId, optionIndex })
		// Zmiana głosu = podmiana indeksu po UNIQUE(post_id, user_id) — atomowo,
		// bez read-before-write i bez wyścigów.
		.onConflictDoUpdate({
			target: [postPollVotes.postId, postPollVotes.userId],
			set: { optionIndex },
		});

	const counts = await getPostPollCounts(postId, parsed.data.options.length);
	return { ok: true, data: { counts, myVoteIndex: optionIndex } };
}

/**
 * Liczniki głosów ankiety — tablica długości `optionCount` (brak głosów na
 * opcję = 0). Agregacja COUNT GROUP BY po stronie serwera: klient nigdy nie
 * dostaje wierszy głosów. Głosy poza zakresem (np. po utracie danych posta)
 * są ignorowane, nie wysypują odpowiedzi.
 */
async function getPostPollCounts(postId: string, optionCount: number): Promise<number[]> {
	const rows = await getDb()
		.select({ optionIndex: postPollVotes.optionIndex, votes: sql<number>`count(*)::int` })
		.from(postPollVotes)
		.where(eq(postPollVotes.postId, postId))
		.groupBy(postPollVotes.optionIndex);

	const counts = Array.from({ length: optionCount }, () => 0);
	for (const row of rows) {
		if (row.optionIndex >= 0 && row.optionIndex < optionCount) {
			counts[row.optionIndex] = row.votes;
		}
	}
	return counts;
}

/**
 * Wyniki ankiet dla WSZYSTKICH postów z ankietą w batchu (#241) — dwa równoległe
 * zapytania (liczniki GROUP BY + głosy widza do wyznaczenia „mój głos"). Posty
 * bez ankiety nie trafiają do wyniku. Payload ankiety parsowany Zodem —
 * uszkodzony JSON nie wysypuje całej strony.
 */
export async function getPostPollResults(
	postPolls: { postId: string; poll: PostPollPayload | null }[],
	viewerId: string | null,
): Promise<Map<string, PostPollResults>> {
	const results = new Map<string, PostPollResults>();
	const polled = postPolls.filter((p) => {
		if (!p.poll) return false;
		return postPollSchema.safeParse(p.poll).success;
	});
	if (polled.length === 0) return results;

	const postIds = polled.map((p) => p.postId);
	const [countRows, myVoteRows] = await Promise.all([
		getDb()
			.select({
				postId: postPollVotes.postId,
				optionIndex: postPollVotes.optionIndex,
				votes: sql<number>`count(*)::int`,
			})
			.from(postPollVotes)
			.where(inArray(postPollVotes.postId, postIds))
			.groupBy(postPollVotes.postId, postPollVotes.optionIndex),
		viewerId
			? getDb()
					.select({
						postId: postPollVotes.postId,
						optionIndex: postPollVotes.optionIndex,
					})
					.from(postPollVotes)
					.where(and(inArray(postPollVotes.postId, postIds), eq(postPollVotes.userId, viewerId)))
			: Promise.resolve([]),
	]);

	const countsByPost = new Map<string, number[]>();
	for (const entry of polled) {
		const parsed = postPollSchema.safeParse(entry.poll);
		if (parsed.success)
			countsByPost.set(
				entry.postId,
				Array.from({ length: parsed.data.options.length }, () => 0),
			);
	}
	for (const row of countRows) {
		const counts = countsByPost.get(row.postId);
		const optionCount = counts?.length ?? 0;
		if (counts && row.optionIndex >= 0 && row.optionIndex < optionCount) {
			counts[row.optionIndex] = row.votes;
		}
	}
	const myVoteByPost = new Map<string, number>();
	for (const row of myVoteRows) {
		myVoteByPost.set(row.postId, row.optionIndex);
	}

	for (const [postId, counts] of countsByPost) {
		results.set(postId, { counts, myVoteIndex: myVoteByPost.get(postId) ?? null });
	}
	return results;
}
