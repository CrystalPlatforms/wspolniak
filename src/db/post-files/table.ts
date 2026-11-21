// SPDX-License-Identifier: AGPL-3.0-or-later
import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Metadane plików przyczepionych do postów (#243). Bajty leżą w buckecie R2
 * `POST_FILES` pod gołym kluczem UUID (kolumna `key`, UNIQUE); wiersze są
 * trwałe — pliki rodzinne nie wygasają (w przeciwieństwie do czatu).
 * author/post to zwykłe kolumny tekstowe (konwencja projektu, bez DB FK).
 */
export const postFiles = pgTable(
	"post_files",
	{
		id: text("id").primaryKey(),
		postId: text("post_id").notNull(),
		key: text("key").notNull(),
		name: text("name").notNull(),
		size: integer("size").notNull(),
		mimeType: text("mime_type").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("post_files_key_idx").on(t.key),
		// Lista plików posta w kolejności uploadu (GET posta / cleanup przy usunięciu).
		index("post_files_post_id_idx").on(t.postId),
	],
);
