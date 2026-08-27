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
function makeSelectDb(albumsRows: AlbumRow[], itemRows: ItemRow[]) {
	const albumsChain = {
		orderBy: vi.fn().mockResolvedValue(albumsRows),
		where: vi.fn().mockReturnValue({
			limit: vi.fn().mockResolvedValue(albumsRows.slice(0, 1)),
		}),
	};
	const itemsChain = {
		where: vi.fn().mockReturnValue({
			orderBy: vi.fn().mockResolvedValue(itemRows),
		}),
	};
	const selectMock = vi.fn();
	selectMock.mockImplementation(() => ({
		from: (table: unknown) => {
			const name = getTableName(table as never);
			if (name === "albums") return albumsChain;
			return itemsChain;
		},
	}));
	mockGetDb.mockReturnValue({ select: selectMock } as never);
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
			{ id: "album-new", title: "Nowszy", photoCount: 2, coverImageId: "cf-1" },
			{ id: "album-old", title: "Starszy", photoCount: 1, coverImageId: "cf-3" },
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
