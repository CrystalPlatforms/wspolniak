// SPDX-License-Identifier: AGPL-3.0-or-later
import { desc } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Nieudane uploady zdjęć (issue #135) — diagnostyka dla admina.
// user_id to zwykła kolumna tekstowa (bez DB FK) — konwencja projektu
// (jak bookmarks, post_reactions, calendar). To log jednokierunkowy:
// wpisy nigdy nie aktualizujemy, czyścimy ręcznie/administracyjnie.
export const uploadFailures = pgTable(
	"upload_failures",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").notNull(),
		/** Krok flow: upload-urls | compress | image-upload | create-post. */
		step: text("step").notNull(),
		/** Rodzaj błędu: timeout | network | http | unknown. */
		kind: text("kind").notNull(),
		detail: text("detail"),
		fileName: text("file_name"),
		fileSize: integer("file_size"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		// Panel admina listuje najnowsze pierwsze.
		index("upload_failures_created_at_idx").on(desc(t.createdAt)),
	],
);
