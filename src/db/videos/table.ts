// SPDX-License-Identifier: AGPL-3.0-or-later
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
