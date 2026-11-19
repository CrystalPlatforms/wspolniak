// SPDX-License-Identifier: AGPL-3.0-or-later
import { desc, eq, ilike, or } from "drizzle-orm";
import { users } from "@/db/identity/table";
import { rankSearchResults, tokenizeSearchQuery } from "@/db/search";
import { getDb } from "@/db/setup";
import { albums } from "./table";

export interface AlbumMatch {
	id: string;
	title: string;
	creatorName: string;
	createdAt: Date;
}

interface SearchRow {
	id: string;
	title: string;
	creatorName: string | null;
	createdAt: Date;
}

/**
 * Kandydaci: ILIKE po tytule LUB nazwie twórcy. Bez LIMIT — ILIKE już
 * odfiltrował, szukamy po całym archiwum.
 */
async function fetchSearchCandidates(tokens: string[]): Promise<SearchRow[]> {
	return getDb()
		.select({
			id: albums.id,
			title: albums.title,
			creatorName: users.name,
			createdAt: albums.createdAt,
		})
		.from(albums)
		.leftJoin(users, eq(albums.creatorId, users.id))
		.where(
			tokens.length === 0
				? undefined
				: or(
						...tokens.map((token) =>
							or(ilike(albums.title, `%${token}%`), ilike(users.name, `%${token}%`)),
						),
					),
		)
		.orderBy(desc(albums.createdAt));
}

/**
 * Keyword search po albumach: tokeny ze wspólnych helperów, trafienia
 * w tytule albo twórcy, ranking (remis → nowszy), wyłącznie metadane.
 */
export async function searchAlbums(query: string, limit: number): Promise<AlbumMatch[]> {
	if (limit <= 0) return [];
	const tokens = tokenizeSearchQuery(query);
	if (tokens.length === 0) return [];

	const rows = await fetchSearchCandidates(tokens);
	const matches: AlbumMatch[] = rows.map((row) => ({
		id: row.id,
		title: row.title,
		creatorName: row.creatorName ?? "",
		createdAt: row.createdAt,
	}));
	return rankSearchResults(matches, tokens, limit, (album) => [album.title, album.creatorName]);
}
