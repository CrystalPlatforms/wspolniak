// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import type { bookmarks } from "./table";

vi.mock("@/db/setup", () => ({
	getDb: vi.fn(),
}));

import { getDb } from "@/db/setup";

const mockGetDb = vi.mocked(getDb);

const now = new Date();

type BookmarkRow = InferSelectModel<typeof bookmarks>;

function mockBookmark(overrides: Partial<BookmarkRow> = {}): BookmarkRow {
	return {
		id: "bookmark-1",
		userId: "user-1",
		postId: "post-1",
		createdAt: now,
		...overrides,
	};
}

describe("createBookmark", () => {
	function mockInsertChain(returningRows: BookmarkRow[]) {
		const mockReturning = vi.fn().mockResolvedValue(returningRows);
		const mockOnConflictDoNothing = vi.fn().mockReturnValue({ returning: mockReturning });
		const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
		const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
		mockGetDb.mockReturnValue({ insert: mockInsert } as never);
		return { mockValues };
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("inserts a bookmark with a generated id for user+post", async () => {
		const { mockValues } = mockInsertChain([mockBookmark()]);
		const { createBookmark } = await import("./queries");

		const result = await createBookmark({ userId: "user-1", postId: "post-1" });

		expect(mockValues).toHaveBeenCalledWith(
			expect.objectContaining({
				id: expect.any(String),
				userId: "user-1",
				postId: "post-1",
			}),
		);
		expect(result?.id).toBe("bookmark-1");
	});

	it("returns null when the bookmark already exists (idempotent)", async () => {
		mockInsertChain([]); // onConflictDoNothing → no rows
		const { createBookmark } = await import("./queries");

		const result = await createBookmark({ userId: "user-1", postId: "post-1" });

		expect(result).toBeNull();
	});
});

describe("deleteBookmark", () => {
	function mockDeleteChain(returningRows: BookmarkRow[]) {
		const mockReturning = vi.fn().mockResolvedValue(returningRows);
		const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
		const mockDelete = vi.fn().mockReturnValue({ where: mockWhere });
		mockGetDb.mockReturnValue({ delete: mockDelete } as never);
		return { mockWhere };
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("deletes the bookmark for the given user+post and returns it", async () => {
		const { mockWhere } = mockDeleteChain([mockBookmark()]);
		const { deleteBookmark } = await import("./queries");

		const result = await deleteBookmark("user-1", "post-1");

		expect(result?.id).toBe("bookmark-1");
		expect(mockWhere).toHaveBeenCalledTimes(1);
	});

	it("returns null when the bookmark does not exist", async () => {
		mockDeleteChain([]);
		const { deleteBookmark } = await import("./queries");

		const result = await deleteBookmark("user-1", "post-1");

		expect(result).toBeNull();
	});
});

describe("listBookmarksForUser", () => {
	function mockSelectChain(rows: BookmarkRow[]) {
		const mockOrderBy = vi.fn().mockResolvedValue(rows);
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);
		return { mockWhere };
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns bookmarks scoped to the user", async () => {
		const older = mockBookmark({ id: "b-old", createdAt: new Date("2026-01-01") });
		const newer = mockBookmark({ id: "b-new", createdAt: new Date("2026-06-01") });
		const { mockWhere } = mockSelectChain([newer, older]);
		const { listBookmarksForUser } = await import("./queries");

		const result = await listBookmarksForUser("user-1");

		expect(result).toHaveLength(2);
		expect(mockWhere).toHaveBeenCalledTimes(1);
	});

	it("returns an empty array when the user has no bookmarks", async () => {
		mockSelectChain([]);
		const { listBookmarksForUser } = await import("./queries");

		const result = await listBookmarksForUser("user-1");

		expect(result).toEqual([]);
	});
});
