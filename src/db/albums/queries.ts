// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { AppError } from "@/core/errors";
import { getDb } from "@/db/setup";
import { listVideosByIds } from "@/db/videos";
import type { AlbumItemKind } from "./schema";
import { MAX_ALBUM_ITEMS } from "./schema";
import { albumItems, albums } from "./table";

export type Album = InferSelectModel<typeof albums>;
export type AlbumItem = InferSelectModel<typeof albumItems>;

/** Kafelek listy albumów — okładka + tytuł + liczniki per kind (#172). */
export interface AlbumTile {
	id: string;
	title: string;
	/** Twórca — UI pokazuje menu „⋯" tylko twórcy/adminowi (#173). */
	creatorId: string;
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
 *
 * Twardy limit 500 elementów/album (#173): liczony PRZED insertem —
 * przekroczenie rzuca AppError mapowane przez API na czytelny błąd.
 */
export async function addAlbumItems(input: {
	albumId: string;
	kind: AlbumItemKind;
	refs: string[];
}): Promise<AlbumItem[]> {
	const db = getDb();
	const base = Date.now();

	const countRows = await db
		.select({ value: count() })
		.from(albumItems)
		.where(eq(albumItems.albumId, input.albumId));
	const existing = countRows[0]?.value ?? 0;
	if (existing + input.refs.length > MAX_ALBUM_ITEMS) {
		throw new AppError(`Limit albumu to ${MAX_ALBUM_ITEMS} elementów`, "VALIDATION", 400);
	}

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
 * Kafelki albumów newest-first (created_at DESC): okładka = ręcznie wybrana
 * (#173) albo — gdy brak wyboru — pierwsze zdjęcie w kolejności dodawania
 * (PRD: wideo nie może być okładką). Liczniki w aplikacji — skala rodzinna,
 * jeden batch elementów wystarcza (deep module).
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
	/** Pierwsze zdjęcie albumu (fallback okładki) — albumId → cfImageId. */
	const firstPhotos = new Map<string, string>();
	/** Zdjęcia po id elementu (rozwiązanie ręcznej okładki #173). */
	const photoRefsByItemId = new Map<string, string>();
	for (const item of itemRows) {
		if (item.kind === "video") {
			videoCounts.set(item.albumId, (videoCounts.get(item.albumId) ?? 0) + 1);
			continue;
		}
		photoCounts.set(item.albumId, (photoCounts.get(item.albumId) ?? 0) + 1);
		photoRefsByItemId.set(item.id, item.ref);
		if (!firstPhotos.has(item.albumId)) firstPhotos.set(item.albumId, item.ref);
	}

	return albumRows.map((a) => ({
		id: a.id,
		title: a.title,
		creatorId: a.creatorId,
		photoCount: photoCounts.get(a.id) ?? 0,
		videoCount: videoCounts.get(a.id) ?? 0,
		// Wybrany element zniknął (np. kaskada przed czyszczeniem okładki) → fallback.
		coverImageId:
			(a.coverItemId ? photoRefsByItemId.get(a.coverItemId) : undefined) ??
			firstPhotos.get(a.id) ??
			null,
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

/** Zmienia nazwę albumu (#173). null = album nie istnieje. */
export async function renameAlbum(albumId: string, title: string): Promise<Album | null> {
	const rows = await getDb()
		.update(albums)
		.set({ title })
		.where(eq(albums.id, albumId))
		.returning();
	return rows[0] ?? null;
}

/**
 * Ustawia ręczną okładkę (#173) — id elementu albumu. Walidacja „element jest
 * zdjęciem z TEGO albumu" siedzi w warstwie API (ma już pobrane elementy);
 * domena zapisuje sam wskaźnik. null = album nie istnieje.
 */
export async function setAlbumCover(albumId: string, itemId: string): Promise<Album | null> {
	const rows = await getDb()
		.update(albums)
		.set({ coverItemId: itemId })
		.where(eq(albums.id, albumId))
		.returning();
	return rows[0] ?? null;
}

/**
 * Usuwa element z albumu (#173): źródło (post/wideo/własne zdjęcie) pozostaje
 * nietknięte — brak FK, usuwamy tylko wiersz `album_items`. Jeśli usuwany
 * element był okładką, czyścimy wskaźnik (WHERE chroni przed wyścigiem
 * z równoległym setAlbumCover) → wraca domyślna okładka (pierwsze zdjęcie).
 * null = element nie istnieje w tym albumie.
 */
export async function removeAlbumItem(albumId: string, itemId: string): Promise<AlbumItem | null> {
	const db = getDb();
	const rows = await db
		.delete(albumItems)
		.where(and(eq(albumItems.id, itemId), eq(albumItems.albumId, albumId)))
		.returning();
	const removed = rows[0] ?? null;

	if (removed) {
		await db
			.update(albums)
			.set({ coverItemId: null })
			.where(and(eq(albums.id, albumId), eq(albums.coverItemId, removed.id)));
	}

	return removed;
}

/**
 * Usuwa cały album (#173). Zwraca listę cfImageId zdjęć WŁASNYCH (kind =
 * "own_image") do wyczyszczenia z Cloudflare Images — pożyczone (post_photo,
 * video) NIGDY tu nie trafiają, więc usuwanie albumu nie rusza feedu.
 * null = album nie istniał.
 */
export async function deleteAlbum(albumId: string): Promise<string[] | null> {
	const db = getDb();

	const albumRows = await db
		.select({ id: albums.id })
		.from(albums)
		.where(eq(albums.id, albumId))
		.limit(1);
	if (albumRows.length === 0) return null;

	const ownImages = await db
		.select({ ref: albumItems.ref })
		.from(albumItems)
		.where(and(eq(albumItems.albumId, albumId), eq(albumItems.kind, "own_image")));

	// Najpierw elementy, potem album: awaria w połowie zostawia pusty album
	// (widoczny, do usunięcia ponownym kliknięciem), nie osierocone elementy.
	await db.delete(albumItems).where(eq(albumItems.albumId, albumId));
	await db.delete(albums).where(eq(albums.id, albumId));

	return ownImages.map((row) => row.ref);
}

/**
 * Kaskada F5 (#174): usuwa z WSZYSTKICH albumów elementy wskazujące na usunięte
 * źródła — refs to cfImageId zdjęć z posta (kind = "post_photo") albo id wiersza
 * wideo (kind = "video"). Czyści też ręczne okładki wskazujące na usunięte
 * elementy (fallback na pierwsze zdjęcie). Zwraca liczbę usuniętych elementów.
 */
export async function deleteAlbumItemsByRefs(input: {
	kind: AlbumItemKind;
	refs: string[];
}): Promise<number> {
	if (input.refs.length === 0) return 0;
	const db = getDb();

	const removed = await db
		.delete(albumItems)
		.where(and(eq(albumItems.kind, input.kind), inArray(albumItems.ref, input.refs)))
		.returning();

	if (removed.length > 0) {
		await db
			.update(albums)
			.set({ coverItemId: null })
			.where(
				inArray(
					albums.coverItemId,
					removed.map((item) => item.id),
				),
			);
	}

	return removed.length;
}
