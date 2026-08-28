// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (#170):
// - createAlbum: album + N elementów "own_image"; created_at = baza + i ms, bo
//   multi-row insert dostaje identyczne now() — offset ms zachowuje kolejność dodawania.
// - listAlbums: kafelki newest-first, okładka = pierwszy element, licznik zdjęć.
// - getAlbumById: elementy w kolejności dodawania; null gdy album nie istnieje.
// - Feed boundary (AC #170): tworzenie albumu dotyka wyłącznie tabel albums +
//   album_items — nigdy posts.
import type { InferSelectModel } from "drizzle-orm";
import { getTableName } from "drizzle-orm";

vi.mock("@/db/setup", () => ({
	getDb: vi.fn(),
}));

import { getDb } from "@/db/setup";
import type { albumItems, albums } from "./table";

const mockGetDb = vi.mocked(getDb);

const BASE = new Date("2026-08-27T10:00:00.000Z");

type AlbumRow = InferSelectModel<typeof albums>;
type ItemRow = InferSelectModel<typeof albumItems>;

function albumRow(overrides: Partial<AlbumRow> = {}): AlbumRow {
	return {
		id: "album-1",
		creatorId: "u1",
		title: "Wakacje",
		createdAt: BASE,
		...overrides,
	};
}

function itemRow(ref: string, offsetMs: number, albumId = "album-1"): ItemRow {
	return {
		id: `item-${ref}`,
		albumId,
		kind: "own_image",
		ref,
		createdAt: new Date(BASE.getTime() + offsetMs),
	};
}

/** Kolejka wyników .returning() per insert (albums → album_items). */
function makeInsertDb(returningQueue: unknown[][]) {
	const inserts: { table: string; values: unknown }[] = [];
	const insert = vi.fn().mockImplementation((table: unknown) => {
		return {
			values: vi.fn().mockImplementation((values: unknown) => {
				inserts.push({ table: getTableName(table as never), values });
				return {
					returning: vi.fn().mockResolvedValue(returningQueue.shift() ?? []),
				};
			}),
		};
	});
	mockGetDb.mockReturnValue({ insert } as never);
	return { inserts };
}

/**
 * Fake select rozróżniający tabele po nazwie: albums → orderBy(...) [lista]
 * lub where(...).limit(1) [szczegół]; album_items → where(...).orderBy(...).
 */
function makeSelectDb(
	albumsRows: AlbumRow[],
	itemRows: ItemRow[],
	videoRows: Record<string, unknown>[] = [],
) {
	const albumsChain = {
		orderBy: vi.fn().mockResolvedValue(albumsRows),
		where: vi.fn().mockReturnValue({
			limit: vi.fn().mockResolvedValue(albumsRows.slice(0, 1)),
			orderBy: vi.fn().mockResolvedValue(albumsRows),
		}),
	};
	const itemsChain = {
		where: vi.fn().mockReturnValue({
			orderBy: vi.fn().mockResolvedValue(itemRows),
		}),
	};
	// listVideosByIds (#172): select().from(videos).where(inArray) -> wiersze.
	const videosChain = {
		where: vi.fn().mockResolvedValue(videoRows),
	};
	const selectMock = vi.fn();
	selectMock.mockImplementation(() => ({
		from: (table: unknown) => {
			const name = getTableName(table as never);
			if (name === "albums") return albumsChain;
			if (name === "videos") return videosChain;
			return itemsChain;
		},
	}));
	mockGetDb.mockReturnValue({ select: selectMock } as never);
	return { albumsChain, videosChain, selectMock };
}

/**
 * Insert chain z onConflictDoNothing (addAlbumItems #171): values -> conflict ->
 * returning. `returned` symuluje wiersze faktycznie wstawione (po odrzuceniu
 * duplikatow przez unikalny indeks po stronie DB).
 */
function makeConflictInsertDb(returned: ItemRow[]) {
	const inserts: unknown[] = [];
	const onConflictDoNothing = vi.fn(() => ({
		returning: vi.fn().mockResolvedValue(returned),
	}));
	const insert = vi.fn(() => ({
		values: vi.fn((values: unknown) => {
			inserts.push(values);
			return { onConflictDoNothing };
		}),
	}));
	mockGetDb.mockReturnValue({ insert } as never);
	return { inserts, onConflictDoNothing };
}

describe("createAlbum", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("creates an album row and one item per photo, in add order", async () => {
		const queue = [[albumRow()], [itemRow("cf-1", 0), itemRow("cf-2", 1)]];
		const { inserts } = makeInsertDb(queue);
		const { createAlbum } = await import("./queries");

		const result = await createAlbum({
			creatorId: "u1",
			title: "Wakacje",
			photoIds: ["cf-1", "cf-2"],
		});

		// Kolejność elementów = kolejność photoIds (offset ms od wspólnej bazy).
		expect(result.items.map((i) => i.ref)).toEqual(["cf-1", "cf-2"]);
		expect(result.items[0]?.createdAt <= (result.items[1]?.createdAt as Date)).toBe(true);
		expect(inserts.map((i) => i.table)).toEqual(["albums", "album_items"]);
		expect(inserts[0]?.values).toMatchObject({ creatorId: "u1", title: "Wakacje" });
	});

	it("touches only albums + album_items tables — never posts (feed boundary)", async () => {
		const queue = [[albumRow()], []];
		const { inserts } = makeInsertDb(queue);
		const { createAlbum } = await import("./queries");

		await createAlbum({ creatorId: "u1", title: "Wakacje", photoIds: ["cf-1"] });

		// Wyłącznie albums + album_items — zero zapisu do posts (album ≠ post).
		expect(inserts.filter((i) => i.table === "posts")).toHaveLength(0);
	});
});

describe("listAlbums", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns tiles with title, photo count and cover from first item", async () => {
		const albumsRows = [
			albumRow({ id: "album-new", title: "Nowszy", createdAt: BASE }),
			albumRow({ id: "album-old", title: "Starszy", createdAt: new Date(BASE.getTime() - 1000) }),
		];
		const items = [
			itemRow("cf-1", 0, "album-new"),
			itemRow("cf-2", 1, "album-new"),
			itemRow("cf-3", 0, "album-old"),
		];
		makeSelectDb(albumsRows, items);
		const { listAlbums } = await import("./queries");

		const tiles = await listAlbums();

		expect(tiles).toEqual([
			{ id: "album-new", title: "Nowszy", photoCount: 2, videoCount: 0, coverImageId: "cf-1" },
			{ id: "album-old", title: "Starszy", photoCount: 1, videoCount: 0, coverImageId: "cf-3" },
		]);
	});

	it("returns an empty array when there are no albums", async () => {
		makeSelectDb([], []);
		const { listAlbums } = await import("./queries");

		const tiles = await listAlbums();

		expect(tiles).toEqual([]);
	});
});

describe("getAlbumById", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns the album with items in add order", async () => {
		const items = [itemRow("cf-1", 0), itemRow("cf-2", 1)];
		makeSelectDb([albumRow()], items);
		const { getAlbumById } = await import("./queries");

		const detail = await getAlbumById("album-1");

		expect(detail).not.toBeNull();
		expect(detail?.id).toBe("album-1");
		expect(detail?.title).toBe("Wakacje");
		expect(detail?.items.map((i) => i.ref)).toEqual(["cf-1", "cf-2"]);
	});

	it("returns null when the album does not exist", async () => {
		makeSelectDb([], []);
		const { getAlbumById } = await import("./queries");

		const detail = await getAlbumById("missing");

		expect(detail).toBeNull();
	});
});

// Założenia kontraktu (#171/#172):
// - addAlbumItems: insert z onConflictDoNothing — duplikat (album, kind, ref)
//   jest CICHYM no-opem; kolejność jak w createAlbum (created_at = baza + i ms).
// - listAddableAlbums: członek dostaje filtr creator_id, admin widzi wszystkie.
// - listAlbums: liczniki per kind; okładka pomija wideo (okładki = zdjęcia).
// - getAlbumById: elementy wideo wzbogacone o {id, title, thumbnailUrl};
//   zdjęcia dostają video: null; wideo bez rekordu (usunięte) też null.
describe("addAlbumItems", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("appends items in add order with the requested kind", async () => {
		const rows = [itemRow("cf-9", 0), itemRow("cf-8", 1)];
		const { inserts, onConflictDoNothing } = makeConflictInsertDb(rows);
		const { addAlbumItems } = await import("./queries");

		const added = await addAlbumItems({
			albumId: "album-1",
			kind: "post_photo",
			refs: ["cf-9", "cf-8"],
		});

		expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
		const values = inserts[0] as {
			albumId: string;
			kind: string;
			ref: string;
			createdAt: Date;
		}[];
		expect(values.map((v) => v.ref)).toEqual(["cf-9", "cf-8"]);
		expect(values.every((v) => v.kind === "post_photo" && v.albumId === "album-1")).toBe(true);
		const first = values[0] as { createdAt: Date };
		const second = values[1] as { createdAt: Date };
		expect(first.createdAt.getTime() <= second.createdAt.getTime()).toBe(true);
		expect(added.map((i) => i.ref)).toEqual(["cf-9", "cf-8"]);
	});

	it("is a silent no-op for a duplicate (album, kind, ref)", async () => {
		// DB z unikalnym indeksem + onConflictDoNothing zwraca tylko wstawione wiersze.
		const { onConflictDoNothing } = makeConflictInsertDb([itemRow("cf-1", 0)]);
		const { addAlbumItems } = await import("./queries");

		const added = await addAlbumItems({
			albumId: "album-1",
			kind: "video",
			refs: ["cf-1", "yt-dup"],
		});

		expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
		expect(added).toHaveLength(1);
	});
});

describe("listAddableAlbums", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("scopes member results to their own albums (creator filter)", async () => {
		const rows = [albumRow({ id: "a1", title: "Wakacje", creatorId: "u-me" })];
		const { albumsChain, selectMock } = makeSelectDb(rows, []);
		const { listAddableAlbums } = await import("./queries");

		const result = await listAddableAlbums({ userId: "u-me", isAdmin: false });

		// Filtr creator_id aktywny + projekcja tylko id/tytul (mock zwraca wiersze 1:1).
		expect(albumsChain.where).toHaveBeenCalledTimes(1);
		expect(selectMock).toHaveBeenCalledWith({ id: expect.anything(), title: expect.anything() });
		expect(result).toEqual(rows);
	});

	it("lifts the creator filter for admins (all albums)", async () => {
		const rows = [albumRow({ id: "a1", title: "Cudze", creatorId: "u-other" })];
		const { albumsChain, selectMock } = makeSelectDb(rows, []);
		const { listAddableAlbums } = await import("./queries");

		const result = await listAddableAlbums({ userId: "u-admin", isAdmin: true });

		// Admin: .where dostaje undefined (brak filtra) — widzi wszystkie albumy.
		expect(albumsChain.where).toHaveBeenCalledWith(undefined);
		expect(selectMock).toHaveBeenCalledWith({ id: expect.anything(), title: expect.anything() });
		expect(result).toEqual(rows);
	});
});

describe("listAlbums — liczniki per kind (#172)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("counts photos and videos separately; cover skips videos", async () => {
		const albumsRows = [albumRow({ id: "album-mix", title: "Miks" })];
		const videoFirst = { ...itemRow("yt-1", 0, "album-mix"), kind: "video" };
		const photoSecond = itemRow("cf-1", 1, "album-mix");
		const photoThird = itemRow("cf-2", 2, "album-mix");
		// Wideo pierwszy w kolejności dodawania — okładka ma go POMINĄĆ.
		makeSelectDb(albumsRows, [videoFirst, photoSecond, photoThird]);
		const { listAlbums } = await import("./queries");

		const tiles = await listAlbums();

		expect(tiles).toEqual([
			{ id: "album-mix", title: "Miks", photoCount: 2, videoCount: 1, coverImageId: "cf-1" },
		]);
	});
});

describe("getAlbumById — wideo (#172)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("enriches video items with title and thumbnail; photos get video: null", async () => {
		const items = [
			itemRow("cf-1", 0),
			{ ...itemRow("yt-1", 1), kind: "video" },
			{ ...itemRow("yt-gone", 2), kind: "video" },
		];
		const videoRows = [
			{
				id: "yt-1",
				youtubeVideoId: "abc123",
				title: "Fiesta",
				description: null,
				authorId: "u1",
				thumbnailUrl: "https://img.example/yt-1",
				createdAt: BASE,
			},
		];
		makeSelectDb([albumRow()], items, videoRows);
		const { getAlbumById } = await import("./queries");

		const detail = await getAlbumById("album-1");

		expect(detail?.items[0]?.video).toBeNull();
		expect(detail?.items[1]?.video).toEqual({
			id: "yt-1",
			title: "Fiesta",
			thumbnailUrl: "https://img.example/yt-1",
		});
		// Wideo usunięte z biblioteki (brak rekordu) — video: null, render pomija.
		expect(detail?.items[2]?.video).toBeNull();
	});
});
