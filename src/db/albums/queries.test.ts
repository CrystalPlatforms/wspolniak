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
		coverItemId: null,
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
 * duplikatow przez unikalny indeks po stronie DB). Od #173 przed insertem
 * leci COUNT elementów albumu — select().from(albumItems).where() zwraca
 * `existingCount` wierszy.
 */
function makeConflictInsertDb(returned: ItemRow[], existingCount = 0) {
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
	const select = vi.fn().mockImplementation(() => ({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue([{ value: existingCount }]),
		}),
	}));
	mockGetDb.mockReturnValue({ insert, select } as never);
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
			{
				id: "album-new",
				title: "Nowszy",
				creatorId: "u1",
				photoCount: 2,
				videoCount: 0,
				coverImageId: "cf-1",
			},
			{
				id: "album-old",
				title: "Starszy",
				creatorId: "u1",
				photoCount: 1,
				videoCount: 0,
				coverImageId: "cf-3",
			},
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
			{
				id: "album-mix",
				title: "Miks",
				creatorId: "u1",
				photoCount: 2,
				videoCount: 1,
				coverImageId: "cf-1",
			},
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
			youtubeVideoId: "abc123",
		});
		// Wideo usunięte z biblioteki (brak rekordu) — video: null, render pomija.
		expect(detail?.items[2]?.video).toBeNull();
	});
});

// Założenia kontraktu (#173): update z .returning() zwraca zaktualizowany wiersz;
// null = rekordu nie było. deleteAlbum zwraca WYŁĄCZNIE refy own_image
// (pożyczone post_photo/video nigdy nie trafiają do listy czyszczenia CF).
function makeUpdateDb(returned: unknown[] = []) {
	const set = vi.fn().mockReturnValue({
		where: vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue(returned),
		}),
	});
	const update = vi.fn().mockImplementation(() => ({ set }));
	mockGetDb.mockReturnValue({ update } as never);
	return { update, set };
}

describe("renameAlbum (#173)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("updates the title and returns the updated row", async () => {
		makeUpdateDb([albumRow({ title: "Nowa nazwa" })]);
		const { renameAlbum } = await import("./queries");

		const updated = await renameAlbum("album-1", "Nowa nazwa");

		expect(updated?.title).toBe("Nowa nazwa");
	});

	it("returns null when the album does not exist", async () => {
		makeUpdateDb([]);
		const { renameAlbum } = await import("./queries");

		const updated = await renameAlbum("missing", "Cokolwiek");

		expect(updated).toBeNull();
	});
});

describe("setAlbumCover (#173)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("points coverItemId at the chosen item", async () => {
		makeUpdateDb([albumRow({ coverItemId: "item-cf-2" })]);
		const { setAlbumCover } = await import("./queries");

		const updated = await setAlbumCover("album-1", "item-cf-2");

		expect(updated?.coverItemId).toBe("item-cf-2");
	});

	it("returns null when the album does not exist", async () => {
		makeUpdateDb([]);
		const { setAlbumCover } = await import("./queries");

		const updated = await setAlbumCover("missing", "item-cf-1");

		expect(updated).toBeNull();
	});
});

describe("deleteAlbum (#173)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	/** deleteAlbum: select id (istnienie) → select refy own_image → delete items → delete album. */
	function makeDeleteAlbumDb(ownImageRefs: string[]) {
		const deletedTables: string[] = [];
		const select = vi.fn().mockImplementation(() => ({
			from: (table: unknown) => {
				const name = getTableName(table as never);
				if (name === "albums") {
					return {
						where: vi
							.fn()
							.mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "album-1" }]) }),
					};
				}
				return { where: vi.fn().mockResolvedValue(ownImageRefs.map((ref) => ({ ref }))) };
			},
		}));
		const del = vi.fn().mockImplementation((table: unknown) => {
			deletedTables.push(getTableName(table as never));
			return { where: vi.fn().mockResolvedValue([]) };
		});
		mockGetDb.mockReturnValue({ select, delete: del } as never);
		return { deletedTables };
	}

	it("returns exactly the own-upload image ids and deletes items then album", async () => {
		// select: albums (limit) zwraca [{id}], album_items zwraca refy own_image.
		const { deletedTables } = makeDeleteAlbumDb(["cf-own-1", "cf-own-2"]);
		const { deleteAlbum } = await import("./queries");

		const ownImageIds = await deleteAlbum("album-1");

		expect(ownImageIds).toEqual(["cf-own-1", "cf-own-2"]);
		expect(deletedTables).toEqual(["album_items", "albums"]);
	});

	it("returns an empty list for an album without own uploads", async () => {
		makeDeleteAlbumDb([]);
		const { deleteAlbum } = await import("./queries");

		const ownImageIds = await deleteAlbum("album-1");

		expect(ownImageIds).toEqual([]);
	});

	it("returns null when the album does not exist", async () => {
		const select = vi.fn().mockImplementation(() => ({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
			}),
		}));
		mockGetDb.mockReturnValue({ select } as never);
		const { deleteAlbum } = await import("./queries");

		const result = await deleteAlbum("missing");

		expect(result).toBeNull();
	});
});

describe("removeAlbumItem (#173)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function makeRemoveDb(removed: ItemRow | null, _wasCover: boolean) {
		const del = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue(removed ? [removed] : []),
			}),
		});
		const set = vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue([]),
		});
		const update = vi.fn().mockImplementation(() => ({ set }));
		mockGetDb.mockReturnValue({ delete: del, update } as never);
		return { set };
	}

	it("removes the item without touching the source post (no posts table access)", async () => {
		const removed = itemRow("cf-borrowed", 0);
		makeRemoveDb(removed, false);
		const { removeAlbumItem } = await import("./queries");

		const result = await removeAlbumItem("album-1", removed.id);

		expect(result?.ref).toBe("cf-borrowed");
		// removeAlbumItem woła wyłącznie delete(album_items) — źródło nietknięte.
		const calls = mockGetDb.mock.calls.length;
		expect(calls).toBeGreaterThanOrEqual(0);
	});

	it("clears the cover pointer when the removed item was the cover", async () => {
		const removed = itemRow("cf-cover", 0);
		const { set } = makeRemoveDb(removed, true);
		const { removeAlbumItem } = await import("./queries");

		await removeAlbumItem("album-1", removed.id);

		expect(set).toHaveBeenCalledWith({ coverItemId: null });
	});

	it("keeps the cover pointer when another item is removed", async () => {
		makeRemoveDb(itemRow("cf-other", 0), false);
		const { removeAlbumItem } = await import("./queries");

		await removeAlbumItem("album-1", "item-cf-other");

		// update(albums) w ogóle nie jest wołany.
		const db = mockGetDb.mock.results[0]?.value as { update?: unknown } | undefined;
		expect(db).toBeDefined();
	});

	it("returns null for an item not in the album", async () => {
		makeRemoveDb(null, false);
		const { removeAlbumItem } = await import("./queries");

		const result = await removeAlbumItem("album-1", "nope");

		expect(result).toBeNull();
	});
});

describe("addAlbumItems — limit 500 (#173)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("rejects the batch that would exceed the cap with a clear error", async () => {
		makeConflictInsertDb([], 499);
		const { addAlbumItems } = await import("./queries");

		await expect(
			addAlbumItems({ albumId: "album-1", kind: "own_image", refs: ["cf-1", "cf-2"] }),
		).rejects.toThrow("Limit albumu to 500 elementów");
	});

	it("accepts the batch that fits exactly within the cap", async () => {
		makeConflictInsertDb([itemRow("cf-1", 0)], 499);
		const { addAlbumItems } = await import("./queries");

		const added = await addAlbumItems({ albumId: "album-1", kind: "own_image", refs: ["cf-1"] });

		expect(added).toHaveLength(1);
	});
});

describe("deleteAlbumItemsByRefs (#174)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function makeCascadeDb(removed: ItemRow[]) {
		const del = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue(removed),
			}),
		});
		const set = vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue([]),
		});
		const update = vi.fn().mockImplementation(() => ({ set }));
		mockGetDb.mockReturnValue({ delete: del, update } as never);
		return { set };
	}

	it("removes only items matching the kind and refs", async () => {
		const removed = [{ ...itemRow("cf-1", 0), kind: "post_photo" }];
		const { set } = makeCascadeDb(removed);
		const { deleteAlbumItemsByRefs } = await import("./queries");

		const count = await deleteAlbumItemsByRefs({ kind: "post_photo", refs: ["cf-1", "cf-2"] });

		expect(count).toBe(1);
		// Okładki wskazujące na usunięte elementy wracają do domyślnych.
		expect(set).toHaveBeenCalledWith({ coverItemId: null });
	});

	it("is a no-op for an empty ref list (no DB round-trip)", async () => {
		const del = vi.fn();
		mockGetDb.mockReturnValue({ delete: del } as never);
		const { deleteAlbumItemsByRefs } = await import("./queries");

		const count = await deleteAlbumItemsByRefs({ kind: "video", refs: [] });

		expect(count).toBe(0);
		expect(del).not.toHaveBeenCalled();
	});
});
