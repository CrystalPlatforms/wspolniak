// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import { postReactions } from "./table";

vi.mock("@/db/setup", () => ({
	getDb: vi.fn(),
}));

import { getDb } from "@/db/setup";

const mockGetDb = vi.mocked(getDb);

const now = new Date();

function mockReaction(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "reaction-1",
		postId: "post-1",
		commentId: null,
		userId: "user-1",
		reactionType: "heart" as const,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

type ReactionRow = InferSelectModel<typeof postReactions>;

function mockInsertChain(returningRows: ReactionRow[]) {
	const mockReturning = vi.fn().mockResolvedValue(returningRows);
	const mockOnConflictDoUpdate = vi.fn().mockReturnValue({ returning: mockReturning });
	const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
	const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
	mockGetDb.mockReturnValue({ insert: mockInsert } as never);
	return { mockInsert, mockValues, mockOnConflictDoUpdate };
}

describe("upsertReaction", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("persists a POST reaction with comment_id null", async () => {
		const { mockValues, mockOnConflictDoUpdate } = mockInsertChain([mockReaction()]);
		const { upsertReaction } = await import("./queries");

		await upsertReaction({
			target: { kind: "post", postId: "post-1" },
			userId: "user-1",
			reactionType: "heart",
		});

		expect(mockValues).toHaveBeenCalledWith(
			expect.objectContaining({
				postId: "post-1",
				commentId: null,
				userId: "user-1",
				reactionType: "heart",
			}),
		);
		expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				target: expect.arrayContaining([postReactions.postId, postReactions.userId]),
			}),
		);
	});

	it("persists a COMMENT reaction with comment_id set", async () => {
		const { mockValues, mockOnConflictDoUpdate } = mockInsertChain([
			mockReaction({ commentId: "comment-1" }),
		]);
		const { upsertReaction } = await import("./queries");

		await upsertReaction({
			target: { kind: "comment", postId: "post-1", commentId: "comment-1" },
			userId: "user-1",
			reactionType: "flame",
		});

		expect(mockValues).toHaveBeenCalledWith(
			expect.objectContaining({
				postId: "post-1",
				commentId: "comment-1",
				userId: "user-1",
				reactionType: "flame",
			}),
		);
		expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				target: expect.arrayContaining([postReactions.commentId, postReactions.userId]),
			}),
		);
	});

	it("throws when no rows are returned", async () => {
		mockInsertChain([]);
		const { upsertReaction } = await import("./queries");

		await expect(
			upsertReaction({
				target: { kind: "post", postId: "post-1" },
				userId: "user-1",
				reactionType: "heart",
			}),
		).rejects.toThrow();
	});
});

describe("getReactionCounts", () => {
	function mockCountsChain(rows: { reactionType: string; count: number }[]) {
		const mockGroupBy = vi.fn().mockResolvedValue(rows);
		const mockWhere = vi.fn().mockReturnValue({ groupBy: mockGroupBy });
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);
		return { mockWhere };
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns counts grouped by type for a POST target", async () => {
		const { mockWhere } = mockCountsChain([
			{ reactionType: "heart", count: 5 },
			{ reactionType: "flame", count: 2 },
		]);
		const { getReactionCounts } = await import("./queries");

		const result = await getReactionCounts({ kind: "post", postId: "post-1" });

		expect(result.get("heart")).toBe(5);
		expect(result.get("flame")).toBe(2);
		// post target must apply a filter (excludes comment reactions)
		expect(mockWhere).toHaveBeenCalledTimes(1);
	});

	it("returns counts grouped by type for a COMMENT target", async () => {
		const { mockWhere } = mockCountsChain([{ reactionType: "laugh", count: 3 }]);
		const { getReactionCounts } = await import("./queries");

		const result = await getReactionCounts({
			kind: "comment",
			postId: "post-1",
			commentId: "comment-1",
		});

		expect(result.get("laugh")).toBe(3);
		expect(mockWhere).toHaveBeenCalledTimes(1);
	});

	it("returns empty map when no reactions exist", async () => {
		mockCountsChain([]);
		const { getReactionCounts } = await import("./queries");

		const result = await getReactionCounts({ kind: "post", postId: "post-1" });

		expect(result.size).toBe(0);
	});
});

describe("getUserReaction", () => {
	function mockSelectChain(mockRows: ReactionRow[]) {
		const mockWhere = vi.fn().mockResolvedValue(mockRows);
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);
		return { mockWhere };
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns the user reaction for a COMMENT target", async () => {
		mockSelectChain([mockReaction({ commentId: "comment-1", reactionType: "laugh" })]);
		const { getUserReaction } = await import("./queries");

		const result = await getUserReaction(
			{ kind: "comment", postId: "post-1", commentId: "comment-1" },
			"user-1",
		);

		expect(result).not.toBeNull();
		expect(result?.reactionType).toBe("laugh");
		expect(result?.commentId).toBe("comment-1");
	});

	it("returns null when the user has not reacted", async () => {
		mockSelectChain([]);
		const { getUserReaction } = await import("./queries");

		const result = await getUserReaction(
			{ kind: "comment", postId: "post-1", commentId: "comment-1" },
			"user-1",
		);

		expect(result).toBeNull();
	});
});

describe("deleteReaction", () => {
	function mockDeleteChain(returningRows: ReactionRow[]) {
		const mockReturning = vi.fn().mockResolvedValue(returningRows);
		const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
		const mockDelete = vi.fn().mockReturnValue({ where: mockWhere });
		mockGetDb.mockReturnValue({ delete: mockDelete } as never);
		return { mockDelete, mockWhere };
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("deletes the user reaction for a POST target and reports it existed", async () => {
		const { mockWhere } = mockDeleteChain([mockReaction()]);
		const { deleteReaction } = await import("./queries");

		const existed = await deleteReaction({ kind: "post", postId: "post-1" }, "user-1");

		expect(existed).toBe(true);
		// deletes scoped to both the target and the user
		expect(mockWhere).toHaveBeenCalledTimes(1);
	});

	it("reports false when there was no reaction to delete", async () => {
		mockDeleteChain([]);
		const { deleteReaction } = await import("./queries");

		const existed = await deleteReaction(
			{ kind: "comment", postId: "post-1", commentId: "comment-1" },
			"user-1",
		);

		expect(existed).toBe(false);
	});
});

describe("getReactionsWithUsers", () => {
	function mockJoinChain(rows: Record<string, unknown>[]) {
		const mockWhere = vi.fn().mockResolvedValue(rows);
		const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
		const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);
		return { mockWhere };
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns reactions joined with user names for a COMMENT target", async () => {
		mockJoinChain([
			{
				id: "r1",
				postId: "post-1",
				commentId: "comment-1",
				userId: "u1",
				reactionType: "flame",
				createdAt: now,
				updatedAt: now,
				userName: "Tomek",
			},
		]);
		const { getReactionsWithUsers } = await import("./queries");

		const result = await getReactionsWithUsers({
			kind: "comment",
			postId: "post-1",
			commentId: "comment-1",
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.user?.name).toBe("Tomek");
		expect(result[0]?.reactionType).toBe("flame");
		expect(result[0]?.commentId).toBe("comment-1");
	});
});
