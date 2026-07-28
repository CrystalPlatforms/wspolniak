// SPDX-License-Identifier: AGPL-3.0-or-later
import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Wideo rodzinne — jeden rekord = jeden film YouTube (unlisted).
 * `youtube_video_id` UNIQUE: duplikat (np. retry `confirm`) → 409.
 * Indeks na `created_at` obsługuje `countTodayUTC` (WHERE created_at >=UTC midnight).
 */
export const videos = pgTable(
	"videos",
	{
		id: text("id").primaryKey(),
		youtubeVideoId: text("youtube_video_id").notNull().unique(),
		title: text("title").notNull(),
		description: text("description"),
		authorId: text("author_id").notNull(),
		thumbnailUrl: text("thumbnail_url").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [index("videos_created_at_idx").on(t.createdAt)],
);

/**
 * Tabela łącząca post ↔ wideo (F5). `position` = kolejność dodania do posta.
 * Klucz złożony `(post_id, video_id)` gwarantuje, że dane wideo jest przypięte
 * do danego posta co najwyżej raz (idempotentność przy ponownym dodaniu).
 * Indeks na `post_id` obsługuje batchowy odczyt wideo dla listy postów.
 * Bez FK (konwencja repo — kaskady w aplikacji, jak `post_images`).
 */
export const postVideos = pgTable(
	"post_videos",
	{
		postId: text("post_id").notNull(),
		videoId: text("video_id").notNull(),
		position: integer("position").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.postId, t.videoId] }),
		index("post_videos_post_id_idx").on(t.postId),
	],
);
