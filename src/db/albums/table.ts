// SPDX-License-Identifier: AGPL-3.0-or-later
import { asc, desc } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Album rodzinny (#170): tytuł ≤100 znaków (limit wymusza Zod w schema.ts),
 * twórca = właściciel (creator-or-admin w mutacjach od F4). Bez FK — konwencja
 * repo (kaskady w aplikacji, jak bookmarks/post_videos). Indeks created_at
 * obsługuje listę kafelków newest-first.
 */
export const albums = pgTable(
	"albums",
	{
		id: text("id").primaryKey(),
		creatorId: text("creator_id").notNull(),
		title: text("title").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [index("albums_created_at_idx").on(desc(t.createdAt))],
);

/**
 * Element albumu — polimorficzny: kind ∈ {own_image, post_photo, video},
 * ref = cfImageId (zdjęcia własne i z postów) albo id wiersza wideos (YouTube).
 * Unikalność (album, kind, ref) blokuje duplikaty. Bez FK — czyszczenie w
 * aplikacji; created_at = kolejność dodawania (brak kolumny position).
 */
export const albumItems = pgTable(
	"album_items",
	{
		id: text("id").primaryKey(),
		albumId: text("album_id").notNull(),
		kind: text("kind").notNull(),
		ref: text("ref").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("album_items_album_id_kind_ref_idx").on(t.albumId, t.kind, t.ref),
		index("album_items_album_id_created_at_idx").on(t.albumId, asc(t.createdAt)),
	],
);
