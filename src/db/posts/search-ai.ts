// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, asc, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { users } from "@/db/identity/table";
import { getDb } from "@/db/setup";
import { postImages, posts } from "./table";

export interface AiPostMatch {
	id: string;
	description: string;
	authorName: string;
	createdAt: Date;
	/** Pierwsze zdjęcie posta wg displayOrder — null = post bez zdjęć. */
	cfImageId: string | null;
}

/**
 * Superlatywy chronologiczne w zapytaniu („pokaż najstarszy/najnowszy post”).
 * Obie flagi false = zwykły keyword search.
 */
function dateIntent(query: string): { wantsOldest: boolean; wantsNewest: boolean } {
	return {
		wantsOldest: /najstarsz|najwcześn/i.test(query),
		wantsNewest: /najnowsz|najśwież|najpóźn/i.test(query),
	};
}

/**
 * Tokeny zapytania: ≥3 znaki, max 12, unikalne. Stemowanie naiwne: polskie
 * przypadki docięte do prefiksu („wakacjach” → „wakac”) trafiają w formy
 * bazowe w opisach („wakacje”) i odwrotnie — bez tego keyword search nie
 * znajduje postów po odmienionych słowach.
 */
function tokenize(query: string): string[] {
	return [
		...new Set(
			query
				.toLowerCase()
				.split(/[^a-ząćęłńóśźż0-9]+/)
				.filter((token) => token.length >= 3)
				.map((token) => (token.length > 5 ? token.slice(0, 5) : token))
				.slice(0, 12),
		),
	];
}

interface SearchRow {
	id: string;
	description: string | null;
	authorName: string | null;
	createdAt: Date;
	image: { cfImageId: string } | null;
}

/**
 * Kandydaci do rankingu: ILIKE po opisie LUB nazwie autora (trafienie w
 * autora czyni widzialnymi posty bez opisu, np. zapytania „posty Mamy”).
 * `undefined` w where: przy intencji daty filtr słów odpada w całości.
 * Pula kandydatów: 1000 postów — przy intencji daty właściwy koniec historii
 * (najstarsze/najnowsze), inaczej 1000 najnowszych.
 */
async function fetchSearchCandidates(tokens: string[], wantsOldest: boolean): Promise<SearchRow[]> {
	return getDb()
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
		)
		.limit(1000);
}

/** Wiersze SQL → jeden AiPostMatch na post (pierwsze zdjęcie wg displayOrder). */
function aggregateSearchRows(rows: SearchRow[]): AiPostMatch[] {
	const byId = new Map<string, AiPostMatch>();
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
 * Ranking: liczba unikalnych tokenów trafionych w opisie albo autora,
 * remisy rozstrzyga nowsza data. Zwraca top `limit` postów.
 */
function rankByTokenHits(posts: AiPostMatch[], tokens: string[], limit: number): AiPostMatch[] {
	return posts
		.map((post) => ({
			post,
			score: tokens.reduce(
				(total, token) =>
					total +
					(post.description.toLowerCase().includes(token) ||
					post.authorName.toLowerCase().includes(token)
						? 1
						: 0),
				0,
			),
		}))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score || b.post.createdAt.getTime() - a.post.createdAt.getTime())
		.slice(0, limit)
		.map((entry) => entry.post);
}

/**
 * Search-before-answer (F5 #183): keyword search po opisach i autorach postów.
 * Zapytanie usera tnie na słowa (≥3 znaki, max 12), SQL wyłapuje kandydatów
 * przez ILIKE po opisie LUB nazwie autora, JS liczy wynik = liczba unikalnych
 * tokenów trafionych w opisie/autorze (remisy: nowszy post wygrywa). Zwraca
 * WYŁĄCZNIE metadane — id, opis, autor, data, pierwsze zdjęcie; bez komentarzy,
 * czatu i bajtów obrazów. Rodzinna skala: pula kandydatów przycięta do 1000
 * postów (2026-09-05: było 300 — rodzina już je przekroczyła).
 *
 * Intencja chronologiczna („pokaż najstarszy/najnowszy post”): keyword search
 * nie rozumie superlatywów — ranking po trafieniach zwracał zły post, więc
 * przy tej intencji filtr słów odpada, a wynik jest porządkowany DATĄ:
 * rosnąco dla najstarszego, malejąco dla najnowszego.
 */
export async function searchPostsForAi(query: string, limit: number): Promise<AiPostMatch[]> {
	if (limit <= 0) return [];
	const { wantsOldest, wantsNewest } = dateIntent(query);
	const byDate = wantsOldest || wantsNewest;
	const tokens = byDate ? [] : tokenize(query);
	if (tokens.length === 0 && !byDate) return [];

	const rows = await fetchSearchCandidates(tokens, wantsOldest);
	const candidates = aggregateSearchRows(rows);

	// Intencja daty: kolejność chronologiczna zamiast rankingu trafień
	// (sign: rosnąco dla najstarszego, malejąco dla najnowszego).
	if (byDate) {
		const sign = wantsOldest ? 1 : -1;
		return candidates
			.sort((a, b) => sign * (a.createdAt.getTime() - b.createdAt.getTime()))
			.slice(0, limit);
	}

	return rankByTokenHits(candidates, tokens, limit);
}
