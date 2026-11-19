// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { users } from "@/db/identity/table";
import { getDb } from "@/db/setup";
import { comments } from "./table";

export type Comment = InferSelectModel<typeof comments>;

export interface CommentWithAuthor {
	id: string;
	postId: string;
	authorId: string;
	body: string;
	parentId: string | null;
	createdAt: Date;
	updatedAt: Date;
	author: { id: string; name: string };
}

/** Komentarz główny z jego zagnieżdżonymi reply (płaskie wątki — 1 poziom). */
export interface CommentThread extends CommentWithAuthor {
	replies: CommentWithAuthor[];
}

export async function createComment(input: {
	postId: string;
	authorId: string;
	body: string;
}): Promise<Comment> {
	const rows = await getDb()
		.insert(comments)
		.values({ id: crypto.randomUUID(), ...input })
		.returning();

	const row = rows[0];
	if (!row) throw new Error("createComment: insert returned no rows");
	return row;
}

/**
 * Wstawia reply (komentarz z parentId). Czysty CRUD — logika biznesowa
 * (limit 5, brak reply-na-reply, walidacja parenta) orkiestrowana w API handlerze.
 */
export async function createReply(input: {
	postId: string;
	parentId: string;
	authorId: string;
	body: string;
}): Promise<Comment> {
	const rows = await getDb()
		.insert(comments)
		.values({ id: crypto.randomUUID(), ...input })
		.returning();

	const row = rows[0];
	if (!row) throw new Error("createReply: insert returned no rows");
	return row;
}

// Reguły reply żyją w lekkim pliku (bez drizzle) — re-eksport dla beczki i API (issue #239).
export { canAddReply, MAX_REPLIES_PER_COMMENT } from "./reply-rules";

/**
 * Liczy aktywne (nieusunięte) reply danego komentarza nadrzędnego.
 * Używane przez API do egzekwowania limitu 5 reply na komentarz.
 */
export async function countRepliesByComment(parentId: string): Promise<number> {
	const rows = await getDb()
		.select({ count: count() })
		.from(comments)
		.where(and(eq(comments.parentId, parentId), isNull(comments.deletedAt)));

	return rows[0]?.count ?? 0;
}

export async function listCommentsByPost(postId: string): Promise<CommentThread[]> {
	const rows = await getDb()
		.select({
			comment: comments,
			author: { id: users.id, name: users.name },
		})
		.from(comments)
		.leftJoin(users, eq(comments.authorId, users.id))
		.where(and(eq(comments.postId, postId), isNull(comments.deletedAt)))
		.orderBy(asc(comments.createdAt));

	const flat: CommentWithAuthor[] = rows.map((row) => ({
		id: row.comment.id,
		postId: row.comment.postId,
		authorId: row.comment.authorId,
		body: row.comment.body,
		parentId: row.comment.parentId,
		createdAt: row.comment.createdAt,
		updatedAt: row.comment.updatedAt,
		author: { id: row.author?.id ?? "", name: row.author?.name ?? "" },
	}));

	return groupCommentsIntoThreads(flat);
}

/**
 * Grupuje płaską listę komentarzy w wątki (top-level + reply).
 * Top-level = komentarz bez parenta LUB reply, którego parent nie figuruje
 * w wyniku (np. parent soft-deletowany) — pokazujemy je jako główną odpowiedź,
 * żeby nie zniknęły. Reply attachowane są pod istniejącym parentem.
 */
function groupCommentsIntoThreads(flat: CommentWithAuthor[]): CommentThread[] {
	const ids = new Set(flat.map((comment) => comment.id));
	return flat
		.filter((comment) => !comment.parentId || !ids.has(comment.parentId))
		.map((parent) => ({
			...parent,
			replies: flat.filter((comment) => comment.parentId === parent.id),
		}));
}

export async function getCommentById(id: string): Promise<Comment | null> {
	const rows = await getDb()
		.select()
		.from(comments)
		.where(and(eq(comments.id, id), isNull(comments.deletedAt)));

	return rows[0] ?? null;
}

export async function updateCommentBody(id: string, body: string): Promise<Comment | null> {
	const rows = await getDb()
		.update(comments)
		.set({ body, updatedAt: new Date() })
		.where(and(eq(comments.id, id), isNull(comments.deletedAt)))
		.returning();

	return rows[0] ?? null;
}

export async function softDeleteComment(id: string): Promise<Comment | null> {
	const deletedAt = new Date();
	// Kaskada: najpierw soft-delete reply (parentId = id), potem komentarz główny.
	// Gdyby parent istniał bez reply — pierwsze UPDATE dotyka 0 wierszy (bezpieczne).
	await getDb()
		.update(comments)
		.set({ deletedAt })
		.where(and(eq(comments.parentId, id), isNull(comments.deletedAt)));

	const rows = await getDb()
		.update(comments)
		.set({ deletedAt })
		.where(and(eq(comments.id, id), isNull(comments.deletedAt)))
		.returning();

	return rows[0] ?? null;
}

export async function countCommentsByPosts(postIds: string[]): Promise<Map<string, number>> {
	if (postIds.length === 0) return new Map();

	const rows = await getDb()
		.select({ postId: comments.postId, count: count() })
		.from(comments)
		.where(and(inArray(comments.postId, postIds), isNull(comments.deletedAt)))
		.groupBy(comments.postId);

	const map = new Map<string, number>();
	for (const row of rows) {
		map.set(row.postId, row.count);
	}
	return map;
}
