// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/setup";
import { bookmarks } from "./table";

export type Bookmark = InferSelectModel<typeof bookmarks>;

interface CreateBookmarkInput {
	userId: string;
	postId: string;
}

// Idempotentny zapis posta do Biblioteki. Zwraca utworzony wiersz albo null,
// gdy zakładka już istniała (ON CONFLICT DO NOTHING).
export async function createBookmark(input: CreateBookmarkInput): Promise<Bookmark | null> {
	const db = getDb();
	const rows = await db
		.insert(bookmarks)
		.values({
			id: crypto.randomUUID(),
			userId: input.userId,
			postId: input.postId,
		})
		.onConflictDoNothing()
		.returning();
	return rows[0] ?? null;
}

// Lista zakładek usera posortowana od najnowszej (created_at DESC).
export async function listBookmarksForUser(userId: string): Promise<Bookmark[]> {
	const db = getDb();
	return db
		.select()
		.from(bookmarks)
		.where(eq(bookmarks.userId, userId))
		.orderBy(desc(bookmarks.createdAt));
}
// gdy zakładka nie istniała. Scope zawsze ograniczony do userId wywołującego.
export async function deleteBookmark(userId: string, postId: string): Promise<Bookmark | null> {
	const db = getDb();
	const rows = await db
		.delete(bookmarks)
		.where(and(eq(bookmarks.userId, userId), eq(bookmarks.postId, postId)))
		.returning();
	return rows[0] ?? null;
}

// Kaskadowe czyszczenie zakładek wszystkich użytkowników dla usuniętego posta.
// Wywoływane przy usuwaniu posta (#131) — tabela bookmarks nie ma FK (konwencja),
// więc znikanie zakładek zapewnia ten jawny handler zamiast ON DELETE CASCADE.
export async function deleteBookmarksByPost(postId: string): Promise<void> {
	const db = getDb();
	await db.delete(bookmarks).where(eq(bookmarks.postId, postId));
}
