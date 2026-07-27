// SPDX-License-Identifier: AGPL-3.0-or-later
import { countTodayUTC, createVideo, utcDayStart } from "./queries";

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
