// SPDX-License-Identifier: AGPL-3.0-or-later
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { PostLocationPayload, PostPollPayload, PostVideoEntry } from "./schema";

export const posts = pgTable(
	"posts",
	{
		id: text("id").primaryKey(),
		authorId: text("author_id").notNull(),
		description: text("description"),
		// Wideo osadzone w poście (Video v2 #194): [{youtubeVideoId, title, thumbnailUrl}],
		// max 5 (walidacja w schema.ts), kolejność w tablicy = kolejność odtwarzania.
		videos: jsonb("videos").$type<PostVideoEntry[]>().notNull().default([]),
		// Ankieta posta (#241): {question, options} — max 1 na post, ustawialna tylko
		// przy tworzeniu (endpoint update pole ignoruje). Głosy w osobnej tabeli.
		poll: jsonb("poll").$type<PostPollPayload>(),
		// Lokalizacja posta (#242): {lat, lng, label?} — max 1, edytowalna i
		// usuwalna przy edycji (null w PATCH = usunięcie).
		location: jsonb("location").$type<PostLocationPayload>(),
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

// Głosy w ankietach posta (#241) — JEDEN wiersz na
// (post_id, user_id): zmiana głosu to atomowy upsert (ON CONFLICT DO UPDATE po
// tym indeksie), więc unikalność nigdy nie wycieka błędem. Głosowanie tajne —
// tożsamość głosujących nie wychodzi do klientów (serwer agreguje do liczników).
export const postPollVotes = pgTable(
	"post_poll_votes",
	{
		id: text("id").primaryKey(),
		postId: text("post_id").notNull(),
		userId: text("user_id").notNull(),
		optionIndex: integer("option_index").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [uniqueIndex("post_poll_votes_post_user_idx").on(t.postId, t.userId)],
);

export const postImages = pgTable("post_images", {
	id: text("id").primaryKey(),
	postId: text("post_id").notNull(),
	cfImageId: text("cf_image_id").notNull(),
	displayOrder: integer("display_order").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
