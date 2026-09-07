// SPDX-License-Identifier: AGPL-3.0-or-later
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Log otwarć sesji uploadu wideo (Video v2 #194). Zastępuje licznik dzienny,
 * który liczony był po tabeli `videos` — po przejściu na JSONB na postach
 * nie ma już wiersza wideo, więc każde `POST /upload-session` dokłada wpis.
 * Indeks na `created_at` obsługuje `countTodayUTC` (WHERE created_at >= północ UTC).
 */
export const videoUploadEvents = pgTable(
	"video_upload_events",
	{
		id: text("id").primaryKey(),
		authorId: text("author_id").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [index("video_upload_events_created_at_idx").on(t.createdAt)],
);
