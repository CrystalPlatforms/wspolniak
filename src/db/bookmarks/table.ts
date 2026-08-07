// SPDX-License-Identifier: AGPL-3.0-or-later
import { desc } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Biblioteka (Library) — prywatne zakładki użytkownika.
// user_id / post_id to zwykłe kolumny tekstowe (bez DB FK) — konwencja projektu
// (jako post_reactions, calendar, pinned-posts). Znikanie usuniętego posta
// zapewnia filtr zapytania (listPostsByIds odrzuca deletedAt) + czyszczenie w #131.
export const bookmarks = pgTable(
	"bookmarks",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").notNull(),
		postId: text("post_id").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		// Użytkownik nie może zapisać tego samego posta dwa razy.
		uniqueIndex("bookmarks_user_id_post_id_idx").on(t.userId, t.postId),
		// Szybkie pobieranie zakładek usera w kolejności zapisu (najnowsze pierwsze).
		index("bookmarks_user_id_created_at_idx").on(t.userId, desc(t.createdAt)),
	],
);
