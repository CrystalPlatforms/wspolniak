// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	addPostImages,
	countUserPostsToday,
	createPost,
	deletePostImage,
	getPostById,
	listPaginatedPosts,
	listRecentPosts,
	reorderPostImages,
	softDeletePost,
	updatePost,
} from "./queries";
import { postImages, posts } from "./table";

vi.mock("@/db/setup", () => ({
	getDb: vi.fn(),
}));

import { getDb } from "@/db/setup";

const mockGetDb = vi.mocked(getDb);

function mockDbWithInsert(tableResults: Map<unknown, { rows: unknown[] }>) {
	const mockInsert = vi.fn().mockImplementation((table) => {
		const result = tableResults.get(table);
		if (!result) throw new Error("Unexpected table in insert");
		const mockReturning = vi.fn().mockResolvedValue(result.rows);
		return { values: vi.fn().mockReturnValue({ returning: mockReturning }) };
	});
	mockGetDb.mockReturnValue({ insert: mockInsert } as never);
}

describe("createPost", () => {
	it("inserts post and images and returns the post with images", async () => {
		const now = new Date();
		const mockPost = {
			id: "post-1",
			authorId: "user-1",
			description: "Wakacje nad morzem",
			deletedAt: null,
			createdAt: now,
			updatedAt: now,
		};
		const mockImageRows = [
			{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 0, createdAt: now },
			{ id: "img-2", postId: "post-1", cfImageId: "cf-bbb", displayOrder: 1, createdAt: now },
		];

		mockDbWithInsert(
			new Map<unknown, { rows: unknown[] }>([
				[posts, { rows: [mockPost] }],
				[postImages, { rows: mockImageRows }],
			]),
		);

		const result = await createPost({
			authorId: "user-1",
			description: "Wakacje nad morzem",
			cfImageIds: ["cf-aaa", "cf-bbb"],
		});

		expect(result.post.authorId).toBe("user-1");
		expect(result.post.description).toBe("Wakacje nad morzem");
		expect(result.images).toHaveLength(2);
		expect(result.images[0]?.cfImageId).toBe("cf-aaa");
		expect(result.images[1]?.cfImageId).toBe("cf-bbb");
	});

	it("creates post with empty description", async () => {
		const now = new Date();
		const mockPost = {
			id: "post-2",
			authorId: "user-1",
			description: null,
			deletedAt: null,
			createdAt: now,
			updatedAt: now,
		};
		const mockImageRows = [
			{ id: "img-3", postId: "post-2", cfImageId: "cf-ccc", displayOrder: 0, createdAt: now },
		];

		mockDbWithInsert(
			new Map<unknown, { rows: unknown[] }>([
				[posts, { rows: [mockPost] }],
				[postImages, { rows: mockImageRows }],
			]),
		);

		const result = await createPost({
			authorId: "user-1",
			description: null,
			cfImageIds: ["cf-ccc"],
		});

		expect(result.post.description).toBeNull();
		expect(result.images).toHaveLength(1);
	});
});

describe("listRecentPosts", () => {
	it("returns posts in reverse chronological order with author and images", async () => {
		const now = new Date();
		const older = new Date(now.getTime() - 60_000);

		const mockRows = [
			{
				post: {
					id: "post-2",
					authorId: "user-1",
					description: "Nowy",
					deletedAt: null,
					createdAt: now,
					updatedAt: now,
				},
				author: { id: "user-1", name: "Tomek" },
				image: {
					id: "img-2",
					postId: "post-2",
					cfImageId: "cf-bbb",
					displayOrder: 0,
					createdAt: now,
				},
			},
			{
				post: {
					id: "post-1",
					authorId: "user-1",
					description: "Stary",
					deletedAt: null,
					createdAt: older,
					updatedAt: older,
				},
				author: { id: "user-1", name: "Tomek" },
				image: {
					id: "img-1",
					postId: "post-1",
					cfImageId: "cf-aaa",
					displayOrder: 0,
					createdAt: older,
				},
			},
		];

		const mockLimit = vi.fn().mockResolvedValue(mockRows);
		const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere });
		const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
		const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);

		const result = await listRecentPosts(50);

		expect(result).toHaveLength(2);
		expect(result[0]?.id).toBe("post-2");
		expect(result[0]?.author.name).toBe("Tomek");
		expect(result[0]?.images).toHaveLength(1);
		expect(result[1]?.id).toBe("post-1");
	});

	it("groups multiple images under the same post", async () => {
		const now = new Date();

		const mockRows = [
			{
				post: {
					id: "post-1",
					authorId: "user-1",
					description: "Multi",
					deletedAt: null,
					createdAt: now,
					updatedAt: now,
				},
				author: { id: "user-1", name: "Kasia" },
				image: {
					id: "img-1",
					postId: "post-1",
					cfImageId: "cf-aaa",
					displayOrder: 0,
					createdAt: now,
				},
			},
			{
				post: {
					id: "post-1",
					authorId: "user-1",
					description: "Multi",
					deletedAt: null,
					createdAt: now,
					updatedAt: now,
				},
				author: { id: "user-1", name: "Kasia" },
				image: {
					id: "img-2",
					postId: "post-1",
					cfImageId: "cf-bbb",
					displayOrder: 1,
					createdAt: now,
				},
			},
		];

		const mockLimit = vi.fn().mockResolvedValue(mockRows);
		const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere });
		const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
		const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);

		const result = await listRecentPosts(50);

		expect(result).toHaveLength(1);
		expect(result[0]?.images).toHaveLength(2);
		expect(result[0]?.images[0]?.cfImageId).toBe("cf-aaa");
		expect(result[0]?.images[1]?.cfImageId).toBe("cf-bbb");
	});

	it("returns empty array when no posts exist", async () => {
		const mockLimit = vi.fn().mockResolvedValue([]);
		const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere });
		const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
		const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);

		const result = await listRecentPosts(50);

		expect(result).toEqual([]);
	});
});

describe("getPostById", () => {
	it("returns post with author and images for valid id", async () => {
		const now = new Date();
		const mockRows = [
			{
				post: {
					id: "post-1",
					authorId: "user-1",
					description: "Test",
					deletedAt: null,
					createdAt: now,
					updatedAt: now,
				},
				author: { id: "user-1", name: "Tomek" },
				image: {
					id: "img-1",
					postId: "post-1",
					cfImageId: "cf-aaa",
					displayOrder: 0,
					createdAt: now,
				},
			},
			{
				post: {
					id: "post-1",
					authorId: "user-1",
					description: "Test",
					deletedAt: null,
					createdAt: now,
					updatedAt: now,
				},
				author: { id: "user-1", name: "Tomek" },
				image: {
					id: "img-2",
					postId: "post-1",
					cfImageId: "cf-bbb",
					displayOrder: 1,
					createdAt: now,
				},
			},
		];

		const mockOrderBy = vi.fn().mockResolvedValue(mockRows);
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere });
		const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
		const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);

		const result = await getPostById("post-1");

		expect(result).not.toBeNull();
		expect(result?.id).toBe("post-1");
		expect(result?.author.name).toBe("Tomek");
		expect(result?.images).toHaveLength(2);
	});

	it("returns null for non-existent post", async () => {
		const mockOrderBy = vi.fn().mockResolvedValue([]);
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere });
		const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
		const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);

		const result = await getPostById("non-existent");

		expect(result).toBeNull();
	});
});

describe("countUserPostsToday", () => {
	it("returns count of posts created today by user", async () => {
		const mockWhere = vi.fn().mockResolvedValue([{ count: 5 }]);
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);

		const result = await countUserPostsToday("user-1");

		expect(result).toBe(5);
	});

	it("returns 0 when user has no posts today", async () => {
		const mockWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);

		const result = await countUserPostsToday("user-1");

		expect(result).toBe(0);
	});
});

function _makePostRow(id: string, authorName: string, createdAt: Date, imageId?: string) {
	return {
		post: {
			id,
			authorId: "user-1",
			description: `Post ${id}`,
			deletedAt: null,
			createdAt,
			updatedAt: createdAt,
		},
		author: { id: "user-1", name: authorName },
		image: imageId
			? { id: imageId, postId: id, cfImageId: `cf-${imageId}`, displayOrder: 0, createdAt }
			: null,
	};
}

function _mockPaginatedSelectChain(idRows: { id: string }[], fullRows: unknown[]) {
	const mockLimit = vi.fn().mockResolvedValue(idRows);
	const mockOrderBy1 = vi.fn().mockReturnValue({ limit: mockLimit });
	const mockWhere1 = vi.fn().mockReturnValue({ orderBy: mockOrderBy1 });
	const mockFrom1 = vi.fn().mockReturnValue({ where: mockWhere1 });
	const mockSelect1 = vi.fn().mockReturnValue({ from: mockFrom1 });

	const mockOrderBy2 = vi.fn().mockResolvedValue(fullRows);
	const mockWhere2 = vi.fn().mockReturnValue({ orderBy: mockOrderBy2 });
	const mockLeftJoin2b = vi.fn().mockReturnValue({ where: mockWhere2 });
	const mockLeftJoin1b = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2b });
	const mockFrom2 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1b });
	const mockSelect2 = vi.fn().mockReturnValue({ from: mockFrom2 });

	mockGetDb
		.mockReturnValueOnce({ select: mockSelect1 } as never)
		.mockReturnValueOnce({ select: mockSelect2 } as never);
}

function _mockPaginatedEmpty() {
	const mockLimit = vi.fn().mockResolvedValue([]);
	const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
	const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
	const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
	const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
	mockGetDb.mockReturnValue({ select: mockSelect } as never);
}

describe("listPaginatedPosts", () => {
	it("returns correct number of posts when each post has multiple images", async () => {
		const now = new Date();
		const limit = 5;

		const allRows: unknown[] = [];
		for (let i = 0; i < 10; i++) {
			const postId = `post-${i}`;
			const createdAt = new Date(now.getTime() - i * 60_000);
			for (let j = 0; j < 3; j++) {
				allRows.push({
					post: {
						id: postId,
						authorId: "user-1",
						description: `Post ${i}`,
						deletedAt: null,
						createdAt,
						updatedAt: createdAt,
					},
					author: { id: "user-1", name: "Tomek" },
					image: {
						id: `img-${i}-${j}`,
						postId,
						cfImageId: `cf-${i}-${j}`,
						displayOrder: j,
						createdAt,
					},
				});
			}
		}

		const idRows = Array.from({ length: limit + 1 }, (_, i) => ({ id: `post-${i}` }));
		const targetIds = idRows.slice(0, limit).map((r) => r.id);
		const fullRows = allRows.filter((r) =>
			targetIds.includes((r as Record<string, Record<string, string>>).post.id),
		);
		_mockPaginatedSelectChain(idRows, fullRows);

		const result = await listPaginatedPosts({ limit });

		expect(result.posts).toHaveLength(limit);
		expect(result.nextCursor).not.toBeNull();
	});

	it("returns empty posts and null cursor for empty feed", async () => {
		_mockPaginatedEmpty();

		const result = await listPaginatedPosts({ limit: 20 });

		expect(result.posts).toEqual([]);
		expect(result.nextCursor).toBeNull();
	});

	it("returns all posts and null cursor when fewer than limit", async () => {
		const now = new Date();
		const older = new Date(now.getTime() - 60_000);
		const rows = [
			_makePostRow("post-2", "Tomek", now, "img-2"),
			_makePostRow("post-1", "Tomek", older, "img-1"),
		];
		_mockPaginatedSelectChain([{ id: "post-2" }, { id: "post-1" }], rows);

		const result = await listPaginatedPosts({ limit: 20 });

		expect(result.posts).toHaveLength(2);
		expect(result.posts[0]?.id).toBe("post-2");
		expect(result.posts[1]?.id).toBe("post-1");
		expect(result.nextCursor).toBeNull();
	});

	it("returns nextCursor when more posts exist than limit", async () => {
		const base = new Date("2026-01-01T12:00:00Z");
		const limit = 2;
		const rows = [
			_makePostRow("post-3", "Kasia", new Date(base.getTime() - 0), "img-3"),
			_makePostRow("post-2", "Kasia", new Date(base.getTime() - 1000), "img-2"),
		];
		_mockPaginatedSelectChain([{ id: "post-3" }, { id: "post-2" }, { id: "post-1" }], rows);

		const result = await listPaginatedPosts({ limit });

		expect(result.posts).toHaveLength(2);
		expect(result.posts[0]?.id).toBe("post-3");
		expect(result.posts[1]?.id).toBe("post-2");
		expect(result.nextCursor).not.toBeNull();
		expect(result.nextCursor?.id).toBe("post-2");
	});

	it("returns null cursor at exact boundary (posts === limit)", async () => {
		const base = new Date("2026-01-01T12:00:00Z");
		const rows = [
			_makePostRow("post-2", "Kasia", new Date(base.getTime() - 0), "img-2"),
			_makePostRow("post-1", "Kasia", new Date(base.getTime() - 1000), "img-1"),
		];
		_mockPaginatedSelectChain([{ id: "post-2" }, { id: "post-1" }], rows);

		const result = await listPaginatedPosts({ limit: 2 });

		expect(result.posts).toHaveLength(2);
		expect(result.nextCursor).toBeNull();
	});

	it("groups multiple images under the same post in paginated results", async () => {
		const now = new Date();
		const rows = [
			_makePostRow("post-1", "Tomek", now, "img-1"),
			_makePostRow("post-1", "Tomek", now, "img-2"),
		];
		_mockPaginatedSelectChain([{ id: "post-1" }], rows);

		const result = await listPaginatedPosts({ limit: 20 });

		expect(result.posts).toHaveLength(1);
		expect(result.posts[0]?.images).toHaveLength(2);
	});
});

function mockListByIdsSelectChain(rows: unknown[]) {
	const mockOrderBy = vi.fn().mockResolvedValue(rows);
	const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
	const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere });
	const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
	const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
	const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
	mockGetDb.mockReturnValue({ select: mockSelect } as never);
}

describe("listPostsByIds", () => {
	it("returns posts in the requested id order, regardless of DB row order", async () => {
		const now = new Date();
		const rows = [
			_makePostRow("post-2", "Tomek", now, "img-2"),
			_makePostRow("post-1", "Kasia", now, "img-1"),
		];
		mockListByIdsSelectChain(rows);
		const { listPostsByIds } = await import("./queries");

		const result = await listPostsByIds(["post-1", "post-2"]);

		expect(result.map((p) => p.id)).toEqual(["post-1", "post-2"]);
		expect(result[0]?.author.name).toBe("Kasia");
		expect(result[1]?.author.name).toBe("Tomek");
	});

	it("returns empty array for empty ids without querying", async () => {
		mockGetDb.mockClear();
		const { listPostsByIds } = await import("./queries");

		const result = await listPostsByIds([]);

		expect(result).toEqual([]);
		expect(mockGetDb).not.toHaveBeenCalled();
	});
});

function mockUpdateChain(returnedRows: unknown[]) {
	const mockReturning = vi.fn().mockResolvedValue(returnedRows);
	const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
	const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
	const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
	mockGetDb.mockReturnValue({ update: mockUpdate } as never);
}

describe("updatePost", () => {
	it("updates description and returns the updated post", async () => {
		const now = new Date();
		const updatedPost = {
			id: "post-1",
			authorId: "user-1",
			description: "Nowy opis",
			deletedAt: null,
			createdAt: now,
			updatedAt: now,
		};
		mockUpdateChain([updatedPost]);

		const result = await updatePost("post-1", { description: "Nowy opis" });

		expect(result).not.toBeNull();
		expect(result?.description).toBe("Nowy opis");
	});

	it("returns null when post does not exist", async () => {
		mockUpdateChain([]);

		const result = await updatePost("non-existent", { description: "Coś" });

		expect(result).toBeNull();
	});
});

describe("softDeletePost", () => {
	it("sets deletedAt and returns the deleted post", async () => {
		const now = new Date();
		const deletedPost = {
			id: "post-1",
			authorId: "user-1",
			description: "Test",
			deletedAt: now,
			createdAt: now,
			updatedAt: now,
		};
		mockUpdateChain([deletedPost]);

		const result = await softDeletePost("post-1");

		expect(result).not.toBeNull();
		expect(result?.deletedAt).toBeTruthy();
	});

	it("returns null when post does not exist", async () => {
		mockUpdateChain([]);

		const result = await softDeletePost("non-existent");

		expect(result).toBeNull();
	});
});

describe("addPostImages", () => {
	it("inserts new images with correct display order", async () => {
		const now = new Date();
		const newImages = [
			{ id: "img-3", postId: "post-1", cfImageId: "cf-ccc", displayOrder: 2, createdAt: now },
			{ id: "img-4", postId: "post-1", cfImageId: "cf-ddd", displayOrder: 3, createdAt: now },
		];

		mockDbWithInsert(new Map<unknown, { rows: unknown[] }>([[postImages, { rows: newImages }]]));

		const result = await addPostImages("post-1", ["cf-ccc", "cf-ddd"], 2);

		expect(result).toHaveLength(2);
		expect(result[0]?.cfImageId).toBe("cf-ccc");
		expect(result[0]?.displayOrder).toBe(2);
		expect(result[1]?.cfImageId).toBe("cf-ddd");
		expect(result[1]?.displayOrder).toBe(3);
	});

	it("returns empty array when no image ids provided", async () => {
		const result = await addPostImages("post-1", [], 0);

		expect(result).toEqual([]);
	});
});

describe("deletePostImage", () => {
	it("deletes image by id and postId and returns deleted row", async () => {
		const now = new Date();
		const deletedImage = {
			id: "img-1",
			postId: "post-1",
			cfImageId: "cf-aaa",
			displayOrder: 0,
			createdAt: now,
		};

		const mockReturning = vi.fn().mockResolvedValue([deletedImage]);
		const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
		const mockDelete = vi.fn().mockReturnValue({ where: mockWhere });
		mockGetDb.mockReturnValue({ delete: mockDelete } as never);

		const result = await deletePostImage("post-1", "img-1");

		expect(result).not.toBeNull();
		expect(result?.id).toBe("img-1");
	});

	it("returns null when image does not exist", async () => {
		const mockReturning = vi.fn().mockResolvedValue([]);
		const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
		const mockDelete = vi.fn().mockReturnValue({ where: mockWhere });
		mockGetDb.mockReturnValue({ delete: mockDelete } as never);

		const result = await deletePostImage("post-1", "non-existent");

		expect(result).toBeNull();
	});
});

describe("reorderPostImages", () => {
	it("updates display order for all images of a post", async () => {
		const now = new Date();
		const imagesById = new Map([
			[
				"img-2",
				{ id: "img-2", postId: "post-1", cfImageId: "cf-bbb", displayOrder: 0, createdAt: now },
			],
			[
				"img-1",
				{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 1, createdAt: now },
			],
		]);

		let callIndex = 0;
		const order = ["img-2", "img-1"];
		const mockReturning = vi.fn().mockImplementation(() => {
			const id = order[callIndex++];
			const img = id ? imagesById.get(id) : undefined;
			return img ? [img] : [];
		});
		const mockSet = vi
			.fn()
			.mockReturnValue({ where: vi.fn().mockReturnValue({ returning: mockReturning }) });
		const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
		mockGetDb.mockReturnValue({ update: mockUpdate } as never);

		const result = await reorderPostImages("post-1", ["img-2", "img-1"]);

		expect(result).toHaveLength(2);
		expect(result[0]?.id).toBe("img-2");
		expect(result[0]?.displayOrder).toBe(0);
		expect(result[1]?.id).toBe("img-1");
		expect(result[1]?.displayOrder).toBe(1);
	});

	it("returns empty array when no image ids provided", async () => {
		const result = await reorderPostImages("post-1", []);

		expect(result).toEqual([]);
	});
});
