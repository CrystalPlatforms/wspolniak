// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { users } from "@/db/identity/table";
import { rankSearchResults, tokenizeSearchQuery } from "@/db/search";
import { getDb } from "@/db/setup";
import { comments } from "./table";

export interface CommentMatch {
	id: string;
	/** Post, w którym siedzi komentarz — link wyniku prowadzi do posta. */
	postId: string;
	body: string;
	authorName: string;
	createdAt: Date;
}

interface SearchRow {
	id: string;
	postId: string;
	body: string | null;
	authorName: string | null;
	createdAt: Date;
}

/**
 * Kandydaci: nieusunięte komentarze, ILIKE po treści LUB nazwie autora.
 * Bez LIMIT — ILIKE już odfiltrował, szukamy po całym archiwum.
 */
async function fetchSearchCandidates(tokens: string[]): Promise<SearchRow[]> {
	return getDb()
		.select({
			id: comments.id,
			postId: comments.postId,
			body: comments.body,
			authorName: users.name,
			createdAt: comments.createdAt,
		})
		.from(comments)
		.innerJoin(users, eq(comments.authorId, users.id))
		.where(
			and(
				isNull(comments.deletedAt),
				tokens.length === 0
					? undefined
					: or(
							...tokens.map((token) =>
								or(ilike(comments.body, `%${token}%`), ilike(users.name, `%${token}%`)),
							),
						),
			),
		)
		.orderBy(desc(comments.createdAt));
}

/**
 * Keyword search po komentarzach: tokeny ze wspólnych helperów, trafienia
 * w treści albo autorze, ranking (remis → nowszy), wyłącznie metadane.
 * Bez intencji chronologicznej — to feature postów.
 */
export async function searchComments(query: string, limit: number): Promise<CommentMatch[]> {
	if (limit <= 0) return [];
	const tokens = tokenizeSearchQuery(query);
	if (tokens.length === 0) return [];

	const rows = await fetchSearchCandidates(tokens);
	const matches: CommentMatch[] = rows.map((row) => ({
		id: row.id,
		postId: row.postId,
		body: row.body ?? "",
		authorName: row.authorName ?? "",
		createdAt: row.createdAt,
	}));
	return rankSearchResults(matches, tokens, limit, (comment) => [comment.body, comment.authorName]);
}
