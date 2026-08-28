// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
}));

vi.mock("@/db/posts/queries", () => ({
	createPost: vi.fn(),
	listRecentPosts: vi.fn(),
	getPostById: vi.fn(),
	countUserPostsToday: vi.fn(),
	updatePostDescription: vi.fn(),
	softDeletePost: vi.fn(),
	addPostImages: vi.fn(),
	reorderPostImages: vi.fn(),
	deletePostImage: vi.fn(),
}));

vi.mock("@/db/mentions/queries", () => ({
	createMentions: vi.fn(),
	deleteMentionsByPost: vi.fn(),
}));

vi.mock("@/db/bookmarks", () => ({
	deleteBookmarksByPost: vi.fn(),
}));

vi.mock("@/db/albums", () => ({
	deleteAlbumItemsByRefs: vi.fn(),
}));

vi.mock("@/db/pinned-posts", () => ({
	listPinnedPostIds: vi.fn(),
}));

vi.mock("@/db/videos", () => ({
	setPostVideos: vi.fn(),
}));

vi.mock("@/core/feed", () => ({
	assembleFeedPage: vi.fn(),
	withPostVideos: vi.fn(async (post) => ({ ...post, videos: [] })),
}));

import { assembleFeedPage } from "@/core/feed";
import { deleteAlbumItemsByRefs } from "@/db/albums";
import { deleteBookmarksByPost } from "@/db/bookmarks";
import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import { createMentions, deleteMentionsByPost } from "@/db/mentions/queries";
import {
	addPostImages,
	countUserPostsToday,
	createPost,
	deletePostImage,
	getPostById,
	reorderPostImages,
	softDeletePost,
	updatePostDescription,
} from "@/db/posts/queries";
import postsEndpoint from "./posts";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockCreatePost = vi.mocked(createPost);
const mockCountToday = vi.mocked(countUserPostsToday);
const mockAssembleFeed = vi.mocked(assembleFeedPage);
const mockGetPost = vi.mocked(getPostById);
const mockUpdateDescription = vi.mocked(updatePostDescription);
const mockSoftDelete = vi.mocked(softDeletePost);
const mockAddPostImages = vi.mocked(addPostImages);
const mockReorderPostImages = vi.mocked(reorderPostImages);
const mockDeletePostImage = vi.mocked(deletePostImage);
const mockCreateMentions = vi.mocked(createMentions);
const mockDeleteMentionsByPost = vi.mocked(deleteMentionsByPost);
const mockDeleteBookmarksByPost = vi.mocked(deleteBookmarksByPost);
const mockDeleteAlbumItemsByRefs = vi.mocked(deleteAlbumItemsByRefs);

function createApi() {
	const api = new Hono<{
		Bindings: { SESSION_SECRET: string };
	}>().basePath("/api/app");
	api.route("/posts", postsEndpoint);
	return api;
}

const env = { SESSION_SECRET: "secret" };

function authedRequest(_path: string, init?: RequestInit) {
	return {
		...init,
		headers: { Cookie: "session=valid-jwt", ...init?.headers },
	};
}

describe("POST /api/app/posts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
	});

	it("creates post with valid input", async () => {
		mockCountToday.mockResolvedValue(0);
		const now = new Date();
		mockCreatePost.mockResolvedValue({
			post: {
				id: "post-1",
				authorId: "u1",
				description: "Test",
				deletedAt: null,
				createdAt: now,
				updatedAt: now,
			},
			images: [
				{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 0, createdAt: now },
			],
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: "Test", cfImageIds: ["cf-aaa"] }),
			}),
			env,
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as { data: { id: string } };
		expect(body.data.id).toBe("post-1");
		expect(mockCreatePost).toHaveBeenCalledWith({
			authorId: "u1",
			description: "Test",
			cfImageIds: ["cf-aaa"],
		});
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/app/posts",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ cfImageIds: ["cf-aaa"] }),
			},
			env,
		);

		expect(res.status).toBe(401);
	});

	it("creates post with empty cfImageIds (text-only post)", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ cfImageIds: [] }),
			}),
			env,
		);

		expect(res.status).toBe(201);
	});

	it("returns 400 when more than 10 images", async () => {
		const ids = Array.from({ length: 11 }, (_, i) => `cf-${i}`);
		const api = createApi();
		const res = await api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ cfImageIds: ids }),
			}),
			env,
		);

		expect(res.status).toBe(400);
	});

	it("returns 400 when description exceeds 2000 chars", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: "x".repeat(2001), cfImageIds: ["cf-aaa"] }),
			}),
			env,
		);

		expect(res.status).toBe(400);
	});

	it("returns 429 when daily post limit exceeded", async () => {
		mockCountToday.mockResolvedValue(50);
		const api = createApi();
		const res = await api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ cfImageIds: ["cf-aaa"] }),
			}),
			env,
		);

		expect(res.status).toBe(429);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("limit");
	});

	it("registers dropdown mentions with the new post id (post-level, commentId null)", async () => {
		mockCountToday.mockResolvedValue(0);
		mockCreatePost.mockResolvedValue({
			post: {
				id: "post-1",
				authorId: "u1",
				description: "Hej @Ania",
				deletedAt: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			images: [],
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					description: "Hej @Ania",
					mentions: [{ userId: "u-ania", name: "Ania" }],
				}),
			}),
			env,
		);

		expect(res.status).toBe(201);
		expect(mockCreateMentions).toHaveBeenCalledWith({
			postId: "post-1",
			commentId: null,
			userIds: ["u-ania"],
		});
	});
});

describe("GET /api/app/posts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request("/api/app/posts", {}, env);

		expect(res.status).toBe(401);
	});
});

describe("GET /api/app/posts/:id", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
	});

	it("returns single post by id", async () => {
		const now = new Date();
		mockGetPost.mockResolvedValue({
			id: "post-1",
			authorId: "u1",
			description: "Test",
			createdAt: now,
			updatedAt: now,
			author: { id: "u1", name: "Tomek" },
			images: [],
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1"),
			env,
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { id: string } };
		expect(body.data.id).toBe("post-1");
	});

	it("returns 404 for non-existent post", async () => {
		mockGetPost.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/non-existent",
			authedRequest("/api/app/posts/non-existent"),
			env,
		);

		expect(res.status).toBe(404);
	});
});

describe("GET /api/app/posts (paginated)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
	});

	it("returns the feed page assembled by assembleFeedPage", async () => {
		const now = new Date();
		mockAssembleFeed.mockResolvedValue({
			data: [
				{
					id: "post-1",
					authorId: "u1",
					description: "First",
					createdAt: now,
					updatedAt: now,
					author: { id: "u1", name: "Tomek" },
					images: [],
					commentCount: 3,
					videos: [],
				},
			],
			meta: {
				nextCursor: { createdAt: now.toISOString(), id: "post-1" },
				imageAccountHash: "hash",
			},
		});

		const api = createApi();
		const res = await api.request("/api/app/posts", authedRequest("/api/app/posts"), env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			data: Array<{ id: string }>;
			meta: { nextCursor: { id: string } | null };
		};
		expect(body.data).toHaveLength(1);
		expect(body.data[0]?.id).toBe("post-1");
		expect(body.meta.nextCursor?.id).toBe("post-1");
	});

	it("calls assembleFeedPage without cursor on the first page", async () => {
		mockAssembleFeed.mockResolvedValue({
			data: [],
			meta: { nextCursor: null, imageAccountHash: "" },
		});

		const api = createApi();
		await api.request("/api/app/posts", authedRequest("/api/app/posts"), env);

		expect(mockAssembleFeed).toHaveBeenCalledWith({
			cursor: undefined,
			imageAccountHash: undefined,
		});
	});

	it("parses cursor from query params and passes it to assembleFeedPage", async () => {
		mockAssembleFeed.mockResolvedValue({
			data: [],
			meta: { nextCursor: null, imageAccountHash: "" },
		});

		const api = createApi();
		await api.request(
			"/api/app/posts?cursor=2026-01-01T12:00:00.000Z_post-5",
			authedRequest("/api/app/posts?cursor=2026-01-01T12:00:00.000Z_post-5"),
			env,
		);

		expect(mockAssembleFeed).toHaveBeenCalledWith({
			cursor: { createdAt: "2026-01-01T12:00:00.000Z", id: "post-5" },
			imageAccountHash: undefined,
		});
	});
});

const now = new Date();
const samplePost = {
	id: "post-1",
	authorId: "u1",
	description: "Stary opis",
	deletedAt: null,
	createdAt: now,
	updatedAt: now,
	author: { id: "u1", name: "Tomek" },
	images: [],
};

describe("PATCH /api/app/posts/:id", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
	});

	it("allows author to edit their own post description", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockUpdateDescription.mockResolvedValue({ ...samplePost, description: "Nowy opis" });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: "Nowy opis" }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { description: string } };
		expect(body.data.description).toBe("Nowy opis");
	});

	it("allows admin to edit any post", async () => {
		mockVerify.mockResolvedValue({ userId: "u2", name: "Admin", role: "admin" });
		mockFindUser.mockResolvedValue({
			id: "u2",
			name: "Admin",
			role: "admin",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
		mockGetPost.mockResolvedValue(samplePost);
		mockUpdateDescription.mockResolvedValue({ ...samplePost, description: "Admin edit" });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: "Admin edit" }),
			}),
			env,
		);

		expect(res.status).toBe(200);
	});

	it("returns 403 for non-author non-admin member", async () => {
		mockVerify.mockResolvedValue({ userId: "u2", name: "Kasia", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u2",
			name: "Kasia",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
		mockGetPost.mockResolvedValue(samplePost);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: "Hack" }),
			}),
			env,
		);

		expect(res.status).toBe(403);
		expect(mockUpdateDescription).not.toHaveBeenCalled();
	});

	it("returns 404 for non-existent post", async () => {
		mockGetPost.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/non-existent",
			authedRequest("/api/app/posts/non-existent", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: "Test" }),
			}),
			env,
		);

		expect(res.status).toBe(404);
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: "Test" }),
			},
			env,
		);

		expect(res.status).toBe(401);
	});

	it("returns 400 when description exceeds 2000 chars", async () => {
		mockGetPost.mockResolvedValue(samplePost);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: "x".repeat(2001) }),
			}),
			env,
		);

		expect(res.status).toBe(400);
	});

	it("replaces mentions on edit (delete old then create new from current text)", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockUpdateDescription.mockResolvedValue({ ...samplePost, description: "Nowy @Ania" });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					description: "Nowy @Ania",
					mentions: [{ userId: "u-ania", name: "Ania" }],
				}),
			}),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockDeleteMentionsByPost).toHaveBeenCalledWith("post-1");
		expect(mockCreateMentions).toHaveBeenCalledWith({
			postId: "post-1",
			commentId: null,
			userIds: ["u-ania"],
		});
	});
});

describe("PATCH /api/app/posts/:id — image operations", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
	});

	it("adds new images to existing post via cfImageIds", async () => {
		const now = new Date();
		mockGetPost.mockResolvedValue({
			...samplePost,
			images: [
				{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 0, createdAt: now },
			],
		});
		mockAddPostImages.mockResolvedValue([
			{ id: "img-2", postId: "post-1", cfImageId: "cf-bbb", displayOrder: 1, createdAt: now },
		]);
		mockUpdateDescription.mockResolvedValue({ ...samplePost, updatedAt: now });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ cfImageIds: ["cf-bbb"] }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockAddPostImages).toHaveBeenCalledWith("post-1", ["cf-bbb"], 1);
	});

	it("reorders images via imageOrder", async () => {
		const now = new Date();
		mockGetPost.mockResolvedValue({
			...samplePost,
			images: [
				{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 0, createdAt: now },
				{ id: "img-2", postId: "post-1", cfImageId: "cf-bbb", displayOrder: 1, createdAt: now },
			],
		});
		mockReorderPostImages.mockResolvedValue([
			{ id: "img-2", postId: "post-1", cfImageId: "cf-bbb", displayOrder: 0, createdAt: now },
			{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 1, createdAt: now },
		]);
		mockUpdateDescription.mockResolvedValue({ ...samplePost, updatedAt: now });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ imageOrder: ["img-2", "img-1"] }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockReorderPostImages).toHaveBeenCalledWith("post-1", ["img-2", "img-1"]);
	});

	it("returns 400 when imageOrder contains unknown image ids", async () => {
		mockGetPost.mockResolvedValue({
			...samplePost,
			images: [
				{
					id: "img-1",
					postId: "post-1",
					cfImageId: "cf-aaa",
					displayOrder: 0,
					createdAt: new Date(),
				},
			],
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ imageOrder: ["img-1", "img-hacked"] }),
			}),
			env,
		);

		expect(res.status).toBe(400);
	});
});

describe("DELETE /api/app/posts/:id", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
	});

	it("allows author to delete their own post", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockSoftDelete.mockResolvedValue({ ...samplePost, deletedAt: now });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockSoftDelete).toHaveBeenCalledWith("post-1");
	});

	it("cascades: removes the post's bookmarks for all users on delete (#131)", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockSoftDelete.mockResolvedValue({ ...samplePost, deletedAt: now });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		// Kaskada — zakładki wszystkich userów dla tego posta zostają usunięte.
		expect(mockDeleteBookmarksByPost).toHaveBeenCalledWith("post-1");
	});

	it("allows admin to delete any post", async () => {
		mockVerify.mockResolvedValue({ userId: "u2", name: "Admin", role: "admin" });
		mockFindUser.mockResolvedValue({
			id: "u2",
			name: "Admin",
			role: "admin",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
		mockGetPost.mockResolvedValue(samplePost);
		mockSoftDelete.mockResolvedValue({ ...samplePost, deletedAt: now });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
	});

	it("returns 403 for non-author non-admin member", async () => {
		mockVerify.mockResolvedValue({ userId: "u2", name: "Kasia", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u2",
			name: "Kasia",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
		mockGetPost.mockResolvedValue(samplePost);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(403);
		expect(mockSoftDelete).not.toHaveBeenCalled();
	});

	it("returns 404 for non-existent post", async () => {
		mockGetPost.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/non-existent",
			authedRequest("/api/app/posts/non-existent", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(404);
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request("/api/app/posts/post-1", { method: "DELETE" }, env);

		expect(res.status).toBe(401);
	});
});

describe("DELETE /api/app/posts/:id/images/:imageId", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
	});

	it("allows author to delete an image from their post", async () => {
		const now = new Date();
		mockGetPost.mockResolvedValue({
			...samplePost,
			images: [
				{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 0, createdAt: now },
			],
		});
		mockDeletePostImage.mockResolvedValue({
			id: "img-1",
			postId: "post-1",
			cfImageId: "cf-aaa",
			displayOrder: 0,
			createdAt: now,
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/images/img-1",
			authedRequest("/api/app/posts/post-1/images/img-1", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockDeletePostImage).toHaveBeenCalledWith("post-1", "img-1");
	});

	it("returns 403 for non-author", async () => {
		mockVerify.mockResolvedValue({ userId: "u2", name: "Kasia", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u2",
			name: "Kasia",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
		mockGetPost.mockResolvedValue(samplePost);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/images/img-1",
			authedRequest("/api/app/posts/post-1/images/img-1", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(403);
		expect(mockDeletePostImage).not.toHaveBeenCalled();
	});

	it("returns 404 for non-existent post", async () => {
		mockGetPost.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/non-existent/images/img-1",
			authedRequest("/api/app/posts/non-existent/images/img-1", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(404);
	});

	it("returns 404 when image does not belong to post", async () => {
		mockGetPost.mockResolvedValue({
			...samplePost,
			images: [
				{
					id: "img-1",
					postId: "post-1",
					cfImageId: "cf-aaa",
					displayOrder: 0,
					createdAt: new Date(),
				},
			],
		});
		mockDeletePostImage.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/images/img-999",
			authedRequest("/api/app/posts/post-1/images/img-999", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(404);
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request("/api/app/posts/post-1/images/img-1", { method: "DELETE" }, env);

		expect(res.status).toBe(401);
	});
});

// Kaskada F5 (#174): usunięcie posta wyciąga jego zdjęcia (post_photo, ref =
// cfImageId) ze WSZYSTKICH albumów, w tej samej operacji co soft-delete.
describe("DELETE /api/app/posts/:id — kaskada albumów (#174)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
	});

	it("removes the post's photos from all albums, other items stay", async () => {
		mockGetPost.mockResolvedValue({
			...samplePost,
			images: [
				{
					id: "img-1",
					postId: "post-1",
					cfImageId: "cf-1",
					displayOrder: 0,
					createdAt: new Date(),
				},
				{
					id: "img-2",
					postId: "post-1",
					cfImageId: "cf-2",
					displayOrder: 1,
					createdAt: new Date(),
				},
			],
		});
		mockSoftDelete.mockResolvedValue({ ...samplePost, deletedAt: new Date() });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockSoftDelete).toHaveBeenCalledWith("post-1");
		expect(mockDeleteAlbumItemsByRefs).toHaveBeenCalledWith({
			kind: "post_photo",
			refs: ["cf-1", "cf-2"],
		});
	});
});
