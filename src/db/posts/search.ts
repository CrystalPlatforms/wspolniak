// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, asc, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { users } from "@/db/identity/table";
import { rankSearchResults, tokenizeSearchQuery } from "@/db/search";
import { getDb } from "@/db/setup";
import { postImages, posts } from "./table";

export interface PostMatch {
	id: string;
	description: string;
	authorName: string;
	createdAt: Date;
	/** Pierwsze zdjęcie posta wg displayOrder — null = post bez zdjęć. */
	cfImageId: string | null;
}

/**
 * Superlatywy chronologiczne w zapytaniu („pokaż najstarszy/najnowszy post").
 * Obie flagi false = zwykły keyword search.
 */
function dateIntent(query: string): { wantsOldest: boolean; wantsNewest: boolean } {
	return {
		wantsOldest: /najstarsz|najwcześn/i.test(query),
		wantsNewest: /najnowsz|najśwież|najpóźn/i.test(query),
	};
}

/**
 * Tokeny zapytania pochodzą ze wspólnych helperów (@/db/search) — ta sama
 * tokenizacja dla postów, komentarzy i albumów.
 */

interface SearchRow {
	id: string;
	description: string | null;
	authorName: string | null;
	createdAt: Date;
	image: { cfImageId: string } | null;
}

/**
 * Kandydaci do rankingu: ILIKE po opisie LUB nazwie autora (trafienie w
 * autora czyni widzialnymi posty bez opisu, np. zapytania „posty Mamy").
 * `undefined` w where: przy intencji daty filtr słów odpada w całości.
 * Pula kandydatów: tryb keyword BEZ LIMITU (ILIKE już odfiltrował — szukamy
 * po całym archiwum); tryb daty 1000 postów — właściwy koniec historii
 * (najstarsze/najnowsze).
 */
async function fetchSearchCandidates(
	tokens: string[],
	wantsOldest: boolean,
	cap: number | undefined,
): Promise<SearchRow[]> {
	const query = getDb()
		.select({
			id: posts.id,
			description: posts.description,
			authorName: users.name,
			createdAt: posts.createdAt,
			image: postImages,
		})
		.from(posts)
		.leftJoin(users, eq(posts.authorId, users.id))
		.leftJoin(postImages, eq(posts.id, postImages.postId))
		.where(
			and(
				isNull(posts.deletedAt),
				tokens.length === 0
					? undefined
					: or(
							...tokens.map((token) =>
								or(ilike(posts.description, `%${token}%`), ilike(users.name, `%${token}%`)),
							),
						),
			),
		)
		.orderBy(
			wantsOldest ? asc(posts.createdAt) : desc(posts.createdAt),
			asc(postImages.displayOrder),
		);
	return cap === undefined ? query : query.limit(cap);
}

/** Wiersze SQL → jeden PostMatch na post (pierwsze zdjęcie wg displayOrder). */
function aggregateSearchRows(rows: SearchRow[]): PostMatch[] {
	const byId = new Map<string, PostMatch>();
	for (const row of rows) {
		const existing = byId.get(row.id);
		if (existing) {
			if (row.image && !existing.cfImageId) existing.cfImageId = row.image.cfImageId;
			continue;
		}
		byId.set(row.id, {
			id: row.id,
			description: row.description ?? "",
			authorName: row.authorName ?? "",
			createdAt: row.createdAt,
			cfImageId: row.image?.cfImageId ?? null,
		});
	}
	return [...byId.values()];
}

/**
 * Ranking po wspólnych helperach (@/db/search): liczba unikalnych tokenów
 * trafionych w opis albo autora, remisy rozstrzyga nowsza data.
 */
function rankPosts(posts: PostMatch[], tokens: string[], limit: number): PostMatch[] {
	return rankSearchResults(posts, tokens, limit, (post) => [post.description, post.authorName]);
}

/**
 * Keyword search po opisach i autorach postów. Zapytanie tnie na słowa
 * (≥3 znaki, max 12), SQL wyłapuje kandydatów przez ILIKE po opisie LUB
 * nazwie autora, JS liczy wynik = liczba unikalnych tokenów trafionych
 * w opisie/autorze (remisy: nowszy post wygrywa). Zwraca WYŁĄCZNIE metadane —
 * id, opis, autor, data, pierwsze zdjęcie. Rodzinna skala: pula kandydatów
 * przycięta do 1000 postów.
 *
 * Intencja chronologiczna („pokaż najstarszy/najnowszy post"): keyword search
 * nie rozumie superlatywów — ranking po trafieniach zwracał zły post, więc
 * przy tej intencji filtr słów odpada, a wynik jest porządkowany DATĄ:
 * rosnąco dla najstarszego, malejąco dla najnowszego.
 */
export async function searchPosts(query: string, limit: number): Promise<PostMatch[]> {
	if (limit <= 0) return [];
	const { wantsOldest, wantsNewest } = dateIntent(query);
	const byDate = wantsOldest || wantsNewest;
	const tokens = byDate ? [] : tokenizeSearchQuery(query);
	if (tokens.length === 0 && !byDate) return [];

	const rows = await fetchSearchCandidates(tokens, wantsOldest, byDate ? 1000 : undefined);
	const candidates = aggregateSearchRows(rows);

	// Intencja daty: kolejność chronologiczna zamiast rankingu trafień
	// (sign: rosnąco dla najstarszego, malejąco dla najnowszego).
	if (byDate) {
		const sign = wantsOldest ? 1 : -1;
		return candidates
			.sort((a, b) => sign * (a.createdAt.getTime() - b.createdAt.getTime()))
			.slice(0, limit);
	}

	return rankPosts(candidates, tokens, limit);
}
