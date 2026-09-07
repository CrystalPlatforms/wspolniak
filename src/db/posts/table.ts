// SPDX-License-Identifier: AGPL-3.0-or-later
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { PostVideoEntry } from "./schema";

export const posts = pgTable(
	"posts",
	{
		id: text("id").primaryKey(),
		authorId: text("author_id").notNull(),
		description: text("description"),
		// Wideo osadzone w poście (Video v2 #194): [{youtubeVideoId, title, thumbnailUrl}],
		// max 5 (walidacja w schema.ts), kolejność w tablicy = kolejność odtwarzania.
		videos: jsonb("videos").$type<PostVideoEntry[]>().notNull().default([]),
		deletedAt: timestamp("deleted_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => [
		// Kursorowa paginacja feedu: ORDER BY created_at DESC, id DESC + warunki kursora.
		index("posts_created_at_id_idx").on(t.createdAt.desc(), t.id.desc()),
		// countUserPostsToday: WHERE author_id = ? AND created_at >= ?.
		index("posts_author_id_idx").on(t.authorId),
	],
);

export const postImages = pgTable("post_images", {
	id: text("id").primaryKey(),
	postId: text("post_id").notNull(),
	cfImageId: text("cf_image_id").notNull(),
	displayOrder: integer("display_order").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
