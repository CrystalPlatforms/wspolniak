// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	countTodayUTC,
	createVideo,
	getVideoById,
	listPaginatedVideos,
	listVideosByPostIds,
	setPostVideos,
	utcDayStart,
} from "./queries";

vi.mock("@/db/setup", () => ({
	getDb: vi.fn(),
}));

import { getDb } from "@/db/setup";

const mockGetDb = vi.mocked(getDb);

describe("utcDayStart", () => {
	it("returns midnight UTC for an afternoon timestamp", () => {
		expect(utcDayStart(new Date("2026-07-27T15:30:45.123Z"))).toEqual(
			new Date("2026-07-27T00:00:00.000Z"),
		);
	});

	it("returns the same midnight for just-after-midnight and just-before-midnight", () => {
		const justAfter = utcDayStart(new Date("2026-07-27T00:00:00.001Z"));
		const justBefore = utcDayStart(new Date("2026-07-27T23:59:59.999Z"));
		const midnight = new Date("2026-07-27T00:00:00.000Z");
		expect(justAfter).toEqual(midnight);
		expect(justBefore).toEqual(midnight);
	});

	it("rolls to the next UTC day only after midnight UTC", () => {
		expect(utcDayStart(new Date("2026-12-31T23:59:59.999Z"))).toEqual(
			new Date("2026-12-31T00:00:00.000Z"),
		);
		expect(utcDayStart(new Date("2027-01-01T00:00:00.000Z"))).toEqual(
			new Date("2027-01-01T00:00:00.000Z"),
		);
	});
});

function mockCountChain(rows: { count: number }[]) {
	const mockWhere = vi.fn().mockResolvedValue(rows);
	const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
	const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
	mockGetDb.mockReturnValue({ select: mockSelect } as never);
	return { mockWhere };
}

describe("countTodayUTC", () => {
	it("returns the count from the DB for the UTC-day window", async () => {
		const { mockWhere } = mockCountChain([{ count: 3 }]);

		// 15:00 UTC → okno od 00:00 UTC tego samego dnia
		const result = await countTodayUTC(new Date("2026-07-27T15:00:00Z"));

		expect(result).toBe(3);
		// filtr (gte created_at >= utcDayStart(now)) musi być nałożony
		expect(mockWhere).toHaveBeenCalledOnce();
	});

	it("returns 0 when no videos were uploaded today", async () => {
		mockCountChain([{ count: 0 }]);
		const result = await countTodayUTC(new Date("2026-07-27T23:59:59Z"));
		expect(result).toBe(0);
	});

	it("defaults `now` to the current time when omitted", async () => {
		mockCountChain([{ count: 1 }]);
		const result = await countTodayUTC();
		expect(result).toBe(1);
	});
});

function mockInsertReturning(returnedRows: unknown[]) {
	const mockReturning = vi.fn().mockResolvedValue(returnedRows);
	const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
	const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
	mockGetDb.mockReturnValue({ insert: mockInsert } as never);
	return { mockValues, mockReturning };
}

describe("createVideo", () => {
	it("inserts with a generated id and returns the stored record", async () => {
		const now = new Date();
		const stored = {
			id: "v-1",
			youtubeVideoId: "yt-abc",
			title: "Wakacje",
			description: null,
			authorId: "u1",
			thumbnailUrl: "https://i.ytimg.com/thumb.jpg",
			createdAt: now,
		};
		const { mockValues } = mockInsertReturning([stored]);

		const result = await createVideo({
			youtubeVideoId: "yt-abc",
			title: "Wakacje",
			description: null,
			authorId: "u1",
			thumbnailUrl: "https://i.ytimg.com/thumb.jpg",
		});

		expect(result).toEqual(stored);
		// id generowane po stronie serwera (crypto.randomUUID), authorId z sesji
		expect(mockValues).toHaveBeenCalledWith(
			expect.objectContaining({
				id: expect.any(String),
				youtubeVideoId: "yt-abc",
				authorId: "u1",
				thumbnailUrl: "https://i.ytimg.com/thumb.jpg",
			}),
		);
	});

	it("stores a non-null description when provided", async () => {
		const now = new Date();
		const stored = {
			id: "v-2",
			youtubeVideoId: "yt-def",
			title: "Tytuł",
			description: "Opis filmu",
			authorId: "u2",
			thumbnailUrl: "https://i.ytimg.com/thumb2.jpg",
			createdAt: now,
		};
		const { mockValues } = mockInsertReturning([stored]);

		await createVideo({
			youtubeVideoId: "yt-def",
			title: "Tytuł",
			description: "Opis filmu",
			authorId: "u2",
			thumbnailUrl: "https://i.ytimg.com/thumb2.jpg",
		});

		expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ description: "Opis filmu" }));
	});
});

function mockVideoFeedChain(rows: unknown[], withWhere: boolean) {
	const mockLimit = vi.fn().mockResolvedValue(rows);
	const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
	const mockLeftJoin = vi
		.fn()
		.mockReturnValue(
			withWhere
				? { where: vi.fn().mockReturnValue({ orderBy: mockOrderBy }) }
				: { orderBy: mockOrderBy },
		);
	const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
	const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
	mockGetDb.mockReturnValue({ select: mockSelect } as never);
}

function makeVideoRow(id: string, authorName: string, createdAt: Date) {
	return {
		id,
		youtubeVideoId: `yt-${id}`,
		title: `Wideo ${id}`,
		description: null,
		authorId: "user-1",
		thumbnailUrl: `https://i.ytimg.com/${id}.jpg`,
		createdAt,
		author: { id: "user-1", name: authorName },
	};
}

describe("listPaginatedVideos", () => {
	it("returns videos newest-first with null cursor when fewer than limit", async () => {
		const now = new Date("2026-07-27T12:00:00Z");
		const older = new Date("2026-07-27T11:00:00Z");
		mockVideoFeedChain(
			[makeVideoRow("v-2", "Tomek", now), makeVideoRow("v-1", "Tomek", older)],
			false,
		);

		const result = await listPaginatedVideos({ limit: 20 });

		expect(result.videos).toHaveLength(2);
		expect(result.videos[0]?.id).toBe("v-2");
		expect(result.videos[1]?.id).toBe("v-1");
		expect(result.nextCursor).toBeNull();
	});

	it("returns nextCursor pointing at the last item when more videos exist", async () => {
		const base = new Date("2026-07-27T12:00:00Z");
		mockVideoFeedChain(
			[
				makeVideoRow("v-3", "Kasia", new Date(base.getTime() - 0)),
				makeVideoRow("v-2", "Kasia", new Date(base.getTime() - 1000)),
				makeVideoRow("v-1", "Kasia", new Date(base.getTime() - 2000)),
			],
			false,
		);

		const result = await listPaginatedVideos({ limit: 2 });

		expect(result.videos).toHaveLength(2);
		expect(result.videos[0]?.id).toBe("v-3");
		expect(result.videos[1]?.id).toBe("v-2");
		expect(result.nextCursor).not.toBeNull();
		expect(result.nextCursor?.id).toBe("v-2");
		expect(result.nextCursor?.createdAt).toBe(new Date(base.getTime() - 1000).toISOString());
	});

	it("returns empty list and null cursor when no videos exist", async () => {
		mockVideoFeedChain([], false);

		const result = await listPaginatedVideos({ limit: 20 });

		expect(result.videos).toEqual([]);
		expect(result.nextCursor).toBeNull();
	});

	it("includes the author name via users join", async () => {
		const now = new Date("2026-07-27T12:00:00Z");
		mockVideoFeedChain([makeVideoRow("v-1", "Kasia", now)], false);

		const result = await listPaginatedVideos({ limit: 20 });

		expect(result.videos[0]?.author).toEqual({ id: "user-1", name: "Kasia" });
	});
});

function mockSetPostVideosChain(insertedRows: unknown[]) {
	const mockReturning = vi.fn().mockResolvedValue(insertedRows);
	const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
	const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
	const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
	const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });
	mockGetDb.mockReturnValue({ delete: mockDelete, insert: mockInsert } as never);
	return { mockValues, mockInsert, mockDelete, mockDeleteWhere };
}

describe("setPostVideos", () => {
	it("inserts each video with position equal to its index and returns the rows", async () => {
		const inserted = [
			{ postId: "p1", videoId: "v-A", position: 0 },
			{ postId: "p1", videoId: "v-B", position: 1 },
		];
		const { mockValues } = mockSetPostVideosChain(inserted);

		const result = await setPostVideos("p1", ["v-A", "v-B"]);

		expect(result).toEqual(inserted);
		expect(mockValues).toHaveBeenCalledWith([
			{ postId: "p1", videoId: "v-A", position: 0 },
			{ postId: "p1", videoId: "v-B", position: 1 },
		]);
	});

	it("clears all attachments and skips insert when videoIds is empty", async () => {
		const { mockInsert } = mockSetPostVideosChain([]);

		const result = await setPostVideos("p1", []);

		expect(result).toEqual([]);
		expect(mockInsert).not.toHaveBeenCalled();
	});

	it("removes existing attachments for the post before inserting (replace semantics)", async () => {
		const { mockDeleteWhere } = mockSetPostVideosChain([
			{ postId: "p1", videoId: "v-A", position: 0 },
		]);

		await setPostVideos("p1", ["v-A"]);

		expect(mockDeleteWhere).toHaveBeenCalledOnce();
	});

	it("updates positions when the same videos are re-added in a new order", async () => {
		const { mockValues } = mockSetPostVideosChain([
			{ postId: "p1", videoId: "v-B", position: 0 },
			{ postId: "p1", videoId: "v-A", position: 1 },
		]);

		await setPostVideos("p1", ["v-B", "v-A"]);

		expect(mockValues).toHaveBeenLastCalledWith([
			{ postId: "p1", videoId: "v-B", position: 0 },
			{ postId: "p1", videoId: "v-A", position: 1 },
		]);
	});
});

function mockVideosByPostChain(rows: unknown[]) {
	const mockOrderBy = vi.fn().mockResolvedValue(rows);
	const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
	const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
	const mockInnerJoin = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
	const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
	const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
	mockGetDb.mockReturnValue({ select: mockSelect } as never);
	return { mockWhere };
}

describe("listVideosByPostIds", () => {
	beforeEach(() => {
		mockGetDb.mockClear();
	});

	it("groups videos by post in position order", async () => {
		const d = new Date("2026-07-27T12:00:00Z");
		mockVideosByPostChain([
			row("p1", 0, "v1", "yt1", "A", "u1", "Kasia", d),
			row("p1", 1, "v2", "yt2", "B", "u1", "Kasia", d),
			row("p2", 0, "v3", "yt3", "C", "u2", "Tomek", d),
		]);

		const map = await listVideosByPostIds(["p1", "p2"]);

		expect(map.size).toBe(2);
		expect(map.get("p1")?.map((v) => v.id)).toEqual(["v1", "v2"]);
		expect(map.get("p1")?.[0]?.position).toBe(0);
		expect(map.get("p2")?.[0]?.id).toBe("v3");
	});

	it("returns an empty Map and skips the DB call when postIds is empty", async () => {
		const result = await listVideosByPostIds([]);

		expect(result.size).toBe(0);
		expect(mockGetDb).not.toHaveBeenCalled();
	});

	it("coerces a null author (orphaned video author) to empty id/name", async () => {
		const d = new Date("2026-07-27T12:00:00Z");
		mockVideosByPostChain([row("p1", 0, "v1", "yt1", "A", "u1", null, d)]);

		const map = await listVideosByPostIds(["p1"]);

		expect(map.get("p1")?.[0]?.author).toEqual({ id: "", name: "" });
	});
});

function row(
	postId: string,
	position: number,
	id: string,
	youtubeVideoId: string,
	title: string,
	authorId: string,
	authorName: string | null,
	createdAt: Date,
) {
	return {
		postId,
		position,
		id,
		youtubeVideoId,
		title,
		description: null,
		authorId,
		thumbnailUrl: `https://i.ytimg.com/${id}.jpg`,
		createdAt,
		author: authorName === null ? null : { id: authorId, name: authorName },
	};
}

function mockVideoByIdChain(rows: unknown[]) {
	const mockWhere = vi.fn().mockResolvedValue(rows);
	const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
	const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
	const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
	mockGetDb.mockReturnValue({ select: mockSelect } as never);
}

describe("getVideoById", () => {
	it("returns the video with author name for an existing id", async () => {
		const now = new Date("2026-07-27T12:00:00Z");
		mockVideoByIdChain([makeVideoRow("v-1", "Kasia", now)]);

		const result = await getVideoById("v-1");

		expect(result).not.toBeNull();
		expect(result?.id).toBe("v-1");
		expect(result?.youtubeVideoId).toBe("yt-v-1");
		expect(result?.author).toEqual({ id: "user-1", name: "Kasia" });
	});

	it("returns null for a non-existent id", async () => {
		mockVideoByIdChain([]);

		const result = await getVideoById("missing");

		expect(result).toBeNull();
	});
});

// #172: batchowy odczyt wideo po id dla elementow albumu.
describe("listVideosByIds", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns a Map of videos by id (thumbnail + title for album grid)", async () => {
		const rows = [
			{ id: "v1", title: "Fiesta", thumbnailUrl: "https://img.example/1" },
			{ id: "v2", title: "Plener", thumbnailUrl: "https://img.example/2" },
		];
		const where = vi.fn().mockResolvedValue(rows);
		mockGetDb.mockReturnValue({
			select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })),
		} as never);

		const { listVideosByIds } = await import("./queries");
		const map = await listVideosByIds(["v1", "v2"]);

		expect(map.size).toBe(2);
		expect(map.get("v1")?.title).toBe("Fiesta");
		expect(map.get("v2")?.thumbnailUrl).toBe("https://img.example/2");
	});

	it("skips the DB entirely for an empty id list", async () => {
		const select = vi.fn();
		mockGetDb.mockReturnValue({ select } as never);

		const { listVideosByIds } = await import("./queries");
		const map = await listVideosByIds([]);

		expect(map.size).toBe(0);
		expect(select).not.toHaveBeenCalled();
	});
});
