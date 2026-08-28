// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/setup";
import { listVideosByIds } from "@/db/videos";
import type { AlbumItemKind } from "./schema";
import { albumItems, albums } from "./table";

export type Album = InferSelectModel<typeof albums>;
export type AlbumItem = InferSelectModel<typeof albumItems>;

/** Kafelek listy albumów — okładka + tytuł + liczniki per kind (#172). */
export interface AlbumTile {
	id: string;
	title: string;
	photoCount: number;
	/** #172: liczba pożyczonych wideo (UI chowa przy 0). */
	videoCount: number;
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
 * Dokłada elementy do istniejącego albumu (#171): pożyczone zdjęcia z postów,
 * pożyczone wideo (#172) i własne zdjęcia z akcji „Dodaj zdjęcia". Kolejność
 * jak w createAlbum: created_at = wspólna baza + i ms. Kolizja z unikalnym
 * (album, kind, ref) jest CICHO pomijana (onConflictDoNothing) — dodanie tego
 * samego elementu drugi raz jest no-opem, nie błędem.
 */
export async function addAlbumItems(input: {
	albumId: string;
	kind: AlbumItemKind;
	refs: string[];
}): Promise<AlbumItem[]> {
	const db = getDb();
	const base = Date.now();

	const values = input.refs.map((ref, index) => ({
		id: crypto.randomUUID(),
		albumId: input.albumId,
		kind: input.kind,
		ref,
		createdAt: new Date(base + index),
	}));

	return db.insert(albumItems).values(values).onConflictDoNothing().returning();
}

/** Album skrócony do wyboru w dialogu „Dodaj do albumu" (#171). */
export interface AddableAlbum {
	id: string;
	title: string;
}

/**
 * Albumy, do których można dodawać elementy (#171): członek — własne (dodaje
 * do swoich), admin — wszystkie. Kolejność jak na liście albumów (newest-first).
 */
export async function listAddableAlbums(user: {
	userId: string;
	isAdmin: boolean;
}): Promise<AddableAlbum[]> {
	const db = getDb();

	const rows = await db
		.select({ id: albums.id, title: albums.title })
		.from(albums)
		.where(user.isAdmin ? undefined : eq(albums.creatorId, user.userId))
		.orderBy(desc(albums.createdAt));

	return rows;
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

	const photoCounts = new Map<string, number>();
	const videoCounts = new Map<string, number>();
	const covers = new Map<string, string>();
	for (const item of itemRows) {
		if (item.kind === "video") {
			videoCounts.set(item.albumId, (videoCounts.get(item.albumId) ?? 0) + 1);
			continue;
		}
		photoCounts.set(item.albumId, (photoCounts.get(item.albumId) ?? 0) + 1);
		// Okładka = pierwsze ZDJĘCIE (PRD: wideo nie może być okładką).
		if (!covers.has(item.albumId)) covers.set(item.albumId, item.ref);
	}

	return albumRows.map((a) => ({
		id: a.id,
		title: a.title,
		photoCount: photoCounts.get(a.id) ?? 0,
		videoCount: videoCounts.get(a.id) ?? 0,
		coverImageId: covers.get(a.id) ?? null,
	}));
}

/** Element albumu wzbogacony o metadane wideo (dla kind = "video", #172). */
export interface AlbumItemWithVideo extends AlbumItem {
	/** null dla zdjęć oraz wideo już nieobecnych w bibliotece (render pomija). */
	video: { id: string; title: string; thumbnailUrl: string } | null;
}

/**
 * Szczegóły albumu + elementy w kolejności dodawania (created_at ASC),
 * elementy wideo wzbogacone o tytuł i miniaturkę (#172).
 * Zwraca null, gdy album nie istnieje (API mapuje na 404).
 */
export async function getAlbumById(
	id: string,
): Promise<(Album & { items: AlbumItemWithVideo[] }) | null> {
	const db = getDb();

	const albumRows = await db.select().from(albums).where(eq(albums.id, id)).limit(1);
	const album = albumRows[0];
	if (!album) return null;

	const items = await db
		.select()
		.from(albumItems)
		.where(eq(albumItems.albumId, id))
		.orderBy(asc(albumItems.createdAt));

	// Batch metadanych wideo (#172) — jeden inArray, bez zapytania per element.
	const videoRefs = items.filter((item) => item.kind === "video").map((item) => item.ref);
	const videoRows = await listVideosByIds(videoRefs);

	return {
		...album,
		items: items.map((item) => ({
			...item,
			video:
				item.kind === "video"
					? (() => {
							const row = videoRows.get(item.ref);
							return row ? { id: row.id, title: row.title, thumbnailUrl: row.thumbnailUrl } : null;
						})()
					: null,
		})),
	};
}
