// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, asc, desc, eq, ilike, isNull, or, type SQLWrapper, sql } from "drizzle-orm";
import { users } from "@/db/identity/table";
import { rankSearchResults, tokenizeSearchQuery } from "@/db/search";
import { getDb } from "@/db/setup";
import type { PostLocationPayload, PostPollPayload } from "./schema";
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
	poll: PostPollPayload | null;
	location: PostLocationPayload | null;
}

/**
 * ILIKE na polu JSONB (#244): pytanie ankiety i etykieta lokalizacji szukane
 * tym samym mechanizmem co opis. `->>` na NULL (post bez ankiety/lokalizacji)
 * daje NULL — ILIKE z NULL nigdy nie pasuje, więc brak elementu = brak trafienia.
 */
function jsonbFieldMatches(column: SQLWrapper, field: string, token: string) {
	return sql`(${column} ->> ${field}) ILIKE ${`%${token}%`}`;
}

/**
 * Kandydaci do rankingu: ILIKE po opisie, nazwie autora, pytaniu ankiety albo
 * etykiecie lokalizacji (trafienie w autora czyni widzialnymi posty bez opisu,
 * np. zapytania „posty Mamy"; trafienie w pytanie/etykietę — posty #244).
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
			poll: posts.poll,
			location: posts.location,
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
								or(
									ilike(posts.description, `%${token}%`),
									ilike(users.name, `%${token}%`),
									jsonbFieldMatches(posts.poll, "question", token),
									jsonbFieldMatches(posts.location, "label", token),
								),
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

/**
 * Kandydat rankingu z indeksem #244: pytanie ankiety i etykieta lokalizacji
 * liczą się do trafień, ale NIE wychodzą w interfejsie (PostMatch bez zmian —
 * deep module: rozszerzamy zawartość indeksu, nie kontrakt).
 */
interface SearchMatch extends PostMatch {
	pollQuestion: string | null;
	locationLabel: string | null;
}

/** Wiersze SQL → jeden SearchMatch na post (pierwsze zdjęcie wg displayOrder). */
function aggregateSearchRows(rows: SearchRow[]): SearchMatch[] {
	const byId = new Map<string, SearchMatch>();
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
			pollQuestion: row.poll?.question ?? null,
			locationLabel: row.location?.label ?? null,
		});
	}
	return [...byId.values()];
}

/**
 * Ranking po wspólnych helperach (@/db/search): liczba unikalnych tokenów
 * trafionych w opis, autora, pytanie ankiety albo etykietę lokalizacji,
 * remisy rozstrzyga nowsza data. Bez tego post dopasowany WYŁĄCZNIE pytaniem
 * ankiety miałby score 0 i wypadł z wyników mimo ILIKE-a w SQL.
 */
function rankPosts(posts: SearchMatch[], tokens: string[], limit: number): SearchMatch[] {
	return rankSearchResults(posts, tokens, limit, (post) => [
		post.description,
		post.authorName,
		post.pollQuestion ?? "",
		post.locationLabel ?? "",
	]);
}

/** Rankingowy kandydat → publiczny PostMatch (indeks #244 zostaje w domenie). */
function toPostMatch(match: SearchMatch): PostMatch {
	return {
		id: match.id,
		description: match.description,
		authorName: match.authorName,
		createdAt: match.createdAt,
		cfImageId: match.cfImageId,
	};
}

/**
 * Keyword search po opisach, autorach, pytaniach ankiet i etykietach
 * lokalizacji postów (#244: indeksujemy pytanie, NIE opcje — opcje szum).
 * Zapytanie tnie na słowa (≥3 znaki, max 12), SQL wyłapuje kandydatów przez
 * ILIKE po którymś z tych pól, JS liczy wynik = liczba unikalnych tokenów
 * trafionych w opis/autora/pytanie/etykietę (remisy: nowszy post wygrywa).
 * Zwraca WYŁĄCZNIE metadane — id, opis, autor, data, pierwsze zdjęcie.
 * Rodzinna skala: pula kandydatów przycięta do 1000 postów.
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
			.slice(0, limit)
			.map(toPostMatch);
	}

	return rankPosts(candidates, tokens, limit).map(toPostMatch);
}
