// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/setup";
import { albumItems, albums } from "./table";

export type Album = InferSelectModel<typeof albums>;
export type AlbumItem = InferSelectModel<typeof albumItems>;

/** Kafelek listy albumów — okładka + tytuł + licznik zdjęć. */
export interface AlbumTile {
	id: string;
	title: string;
	photoCount: number;
	coverImageId: string | null;
}

interface CreateAlbumInput {
	creatorId: string;
	title: string;
	photoIds: string[];
}

export interface CreateAlbumResult {
	album: Album;
	items: AlbumItem[];
}

/**
 * Tworzy album razem z pierwszym batchem zdjęć (kolejność = photoIds).
 * created_at elementów = wspólna baza + i ms: multi-row insert dostaje
 * identyczne now(), więc offset ms jest jedynym deterministycznym sposobem
 * zachowania porządku dodawania bez kolumny position (decyzja z planu).
 */
export async function createAlbum(input: CreateAlbumInput): Promise<CreateAlbumResult> {
	const db = getDb();
	const base = Date.now();

	const albumRows = await db
		.insert(albums)
		.values({ id: crypto.randomUUID(), creatorId: input.creatorId, title: input.title })
		.returning();
	const album = albumRows[0];
	if (!album) throw new Error("createAlbum: insert returned no rows");

	const values = input.photoIds.map((ref, index) => ({
		id: crypto.randomUUID(),
		albumId: album.id,
		kind: "own_image",
		ref,
		createdAt: new Date(base + index),
	}));
	const items = await db.insert(albumItems).values(values).returning();

	return { album, items };
}

/**
 * Kafelki albumów newest-first (created_at DESC): okładka = najstarszy element
 * (pierwszy w kolejności dodawania), licznik zdjęć liczony w aplikacji —
 * skala rodzinna, jeden batch elementów wystarcza (deep module).
 */
export async function listAlbums(): Promise<AlbumTile[]> {
	const db = getDb();

	const albumRows = await db.select().from(albums).orderBy(desc(albums.createdAt));
	if (albumRows.length === 0) return [];

	const itemRows = await db
		.select()
		.from(albumItems)
		.where(
			inArray(
				albumItems.albumId,
				albumRows.map((a) => a.id),
			),
		)
		.orderBy(asc(albumItems.createdAt));

	const counts = new Map<string, number>();
	const covers = new Map<string, string>();
	for (const item of itemRows) {
		counts.set(item.albumId, (counts.get(item.albumId) ?? 0) + 1);
		if (!covers.has(item.albumId)) covers.set(item.albumId, item.ref);
	}

	return albumRows.map((a) => ({
		id: a.id,
		title: a.title,
		photoCount: counts.get(a.id) ?? 0,
		coverImageId: covers.get(a.id) ?? null,
	}));
}

/**
 * Szczegóły albumu + elementy w kolejności dodawania (created_at ASC).
 * Zwraca null, gdy album nie istnieje (API mapuje na 404).
 */
export async function getAlbumById(id: string): Promise<(Album & { items: AlbumItem[] }) | null> {
	const db = getDb();

	const albumRows = await db.select().from(albums).where(eq(albums.id, id)).limit(1);
	const album = albumRows[0];
	if (!album) return null;

	const items = await db
		.select()
		.from(albumItems)
		.where(eq(albumItems.albumId, id))
		.orderBy(asc(albumItems.createdAt));

	return { ...album, items };
}
