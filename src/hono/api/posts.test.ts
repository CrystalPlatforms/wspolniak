// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ExecutionContext } from "hono";
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
	updatePost: vi.fn(),
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

vi.mock("@/core/feed", () => ({
	assembleFeedPage: vi.fn(),
	enrichPosts: vi.fn(),
}));

vi.mock("@/core/post-files", () => ({
	syncPostFiles: vi.fn(),
	purgePostFiles: vi.fn(),
	verifyPostFileKeys: vi.fn(),
	deletePostFileObjects: vi.fn(),
	uploadPostFile: vi.fn(),
}));

vi.mock("@/db/posts/polls", () => ({
	voteOnPostPoll: vi.fn(),
}));

vi.mock("@/db/post-files/queries", () => ({
	attachPostFiles: vi.fn(),
	getPostFile: vi.fn(),
	listPostFiles: vi.fn(),
	listPostFilesByKeys: vi.fn(),
	listPostFilesByPostIds: vi.fn(),
	deletePostFilesByPost: vi.fn(),
	detachRemovedPostFiles: vi.fn(),
}));

vi.mock("@/hono/api/video", () => ({
	fireAndForgetYoutubeDelete: vi.fn(),
}));

import { assembleFeedPage, enrichPosts } from "@/core/feed";
import { purgePostFiles, syncPostFiles, verifyPostFileKeys } from "@/core/post-files";
import { deleteAlbumItemsByRefs } from "@/db/albums";
import { deleteBookmarksByPost } from "@/db/bookmarks";
import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import { createMentions, deleteMentionsByPost } from "@/db/mentions/queries";
import { listPinnedPostIds } from "@/db/pinned-posts";
import { attachPostFiles, getPostFile } from "@/db/post-files/queries";
import { voteOnPostPoll } from "@/db/posts/polls";
import {
	addPostImages,
	countUserPostsToday,
	createPost,
	deletePostImage,
	getPostById,
	reorderPostImages,
	softDeletePost,
	updatePost,
} from "@/db/posts/queries";
import { fireAndForgetYoutubeDelete } from "@/hono/api/video";
import postsEndpoint from "./posts";

const mockVerify = vi.mocked(verifySessionCookie);
const mockListPinnedIds = vi.mocked(listPinnedPostIds);
const mockFindUser = vi.mocked(findActiveUserById);
const mockCreatePost = vi.mocked(createPost);
const mockCountToday = vi.mocked(countUserPostsToday);
const mockAssembleFeed = vi.mocked(assembleFeedPage);
const mockEnrichPosts = vi.mocked(enrichPosts);
const mockVerifyPostFileKeys = vi.mocked(verifyPostFileKeys);
const mockSyncPostFiles = vi.mocked(syncPostFiles);
const mockPurgePostFiles = vi.mocked(purgePostFiles);
const mockVoteOnPostPoll = vi.mocked(voteOnPostPoll);
const mockAttachPostFiles = vi.mocked(attachPostFiles);
const mockGetPostFile = vi.mocked(getPostFile);
const mockGetPost = vi.mocked(getPostById);
const mockUpdatePost = vi.mocked(updatePost);
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

const env: { SESSION_SECRET: string; POST_FILES?: unknown } = { SESSION_SECRET: "secret" };

/** Stub R2 (head/get) — granica storage w testach attachu i pobierania (#243). */
function r2Stub() {
	return {
		head: vi.fn(async (key: string) => ({ key, size: 10 })),
		get: vi.fn(async () => null),
		put: vi.fn(),
		delete: vi.fn(),
	};
}

function authedRequest(_path: string, init?: RequestInit) {
	return {
		...init,
		headers: { Cookie: "session=valid-jwt", ...init?.headers },
	};
}

describe("POST /api/app/posts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifyPostFileKeys.mockResolvedValue({ ok: true, data: undefined });
		mockSyncPostFiles.mockResolvedValue({ ok: true, data: undefined });
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
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
				videos: [],
				poll: null,
				location: null,
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
			videos: [],
			poll: null,
			location: null,
		});
	});

	it("creates a post with an embedded videos array (Video v2 #194)", async () => {
		mockCountToday.mockResolvedValue(0);
		const now = new Date();
		const videos = [
			{ youtubeVideoId: "yt-1", title: "Klip", thumbnailUrl: "https://i.ytimg.com/vi/yt-1/hq.jpg" },
			{
				youtubeVideoId: "yt-2",
				title: "Drugi",
				thumbnailUrl: "https://i.ytimg.com/vi/yt-2/hq.jpg",
			},
		];
		mockCreatePost.mockResolvedValue({
			post: {
				id: "post-1",
				authorId: "u1",
				description: "Test",
				deletedAt: null,
				createdAt: now,
				updatedAt: now,
				videos,
				poll: null,
				location: null,
			},
			images: [],
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: "Test", videos }),
			}),
			env,
		);

		expect(res.status).toBe(201);
		// Wideo osadzone w poście — bez osobnych tabel i bez setPostVideos.
		expect(mockCreatePost).toHaveBeenCalledWith(expect.objectContaining({ videos }));
	});

	it("rejects more than 5 videos with 400 (Video v2 #194)", async () => {
		mockCountToday.mockResolvedValue(0);
		const tooMany = Array.from({ length: 6 }, (_, i) => ({
			youtubeVideoId: `yt-${i + 1}`,
			title: `Klip ${i + 1}`,
			thumbnailUrl: `https://i.ytimg.com/vi/yt-${i + 1}/hq.jpg`,
		}));

		const api = createApi();
		const res = await api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: "Test", videos: tooMany }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreatePost).not.toHaveBeenCalled();
	});

	it("rejects a malformed video entry with 400 (Video v2 #194)", async () => {
		mockCountToday.mockResolvedValue(0);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					description: "Test",
					videos: [{ youtubeVideoId: "", title: "", thumbnailUrl: "not-a-url" }],
				}),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreatePost).not.toHaveBeenCalled();
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
				videos: [],
				poll: null,
				location: null,
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
		mockVerifyPostFileKeys.mockResolvedValue({ ok: true, data: undefined });
		mockSyncPostFiles.mockResolvedValue({ ok: true, data: undefined });
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
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
		mockListPinnedIds.mockResolvedValue([]);
		mockEnrichPosts.mockImplementation(async (posts) => posts as never);
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
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
			videos: [],
			poll: null,
			location: null,
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

	it("marks a pinned post with pinned: true so the menu shows „Odepnij” (#227)", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockListPinnedIds.mockResolvedValue(["post-1"]);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1"),
			env,
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { pinned: boolean } };
		expect(body.data.pinned).toBe(true);
	});

	it("marks an unpinned post with pinned: false (#227)", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockListPinnedIds.mockResolvedValue(["post-other"]);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1"),
			env,
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { pinned: boolean } };
		expect(body.data.pinned).toBe(false);
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
		mockVerifyPostFileKeys.mockResolvedValue({ ok: true, data: undefined });
		mockSyncPostFiles.mockResolvedValue({ ok: true, data: undefined });
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
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
					poll: null,
					location: null,
					files: [],
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
	videos: [],
	poll: null,
	location: null,
	author: { id: "u1", name: "Tomek" },
	images: [],
};

describe("PATCH /api/app/posts/:id", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifyPostFileKeys.mockResolvedValue({ ok: true, data: undefined });
		mockSyncPostFiles.mockResolvedValue({ ok: true, data: undefined });
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
	});

	it("allows author to edit their own post description", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockUpdatePost.mockResolvedValue({ ...samplePost, description: "Nowy opis" });

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
			aiOptIn: false,
			aiBlocked: false,
		});
		mockGetPost.mockResolvedValue(samplePost);
		mockUpdatePost.mockResolvedValue({ ...samplePost, description: "Admin edit" });

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
			aiOptIn: false,
			aiBlocked: false,
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
		expect(mockUpdatePost).not.toHaveBeenCalled();
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
		mockUpdatePost.mockResolvedValue({ ...samplePost, description: "Nowy @Ania" });

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
		mockVerifyPostFileKeys.mockResolvedValue({ ok: true, data: undefined });
		mockSyncPostFiles.mockResolvedValue({ ok: true, data: undefined });
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
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
		mockUpdatePost.mockResolvedValue({ ...samplePost, updatedAt: now });

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
		mockUpdatePost.mockResolvedValue({ ...samplePost, updatedAt: now });

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
		mockVerifyPostFileKeys.mockResolvedValue({ ok: true, data: undefined });
		mockSyncPostFiles.mockResolvedValue({ ok: true, data: undefined });
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
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
			aiOptIn: false,
			aiBlocked: false,
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
			aiOptIn: false,
			aiBlocked: false,
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
		mockVerifyPostFileKeys.mockResolvedValue({ ok: true, data: undefined });
		mockSyncPostFiles.mockResolvedValue({ ok: true, data: undefined });
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
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
			aiOptIn: false,
			aiBlocked: false,
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
		mockVerifyPostFileKeys.mockResolvedValue({ ok: true, data: undefined });
		mockSyncPostFiles.mockResolvedValue({ ok: true, data: undefined });
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
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

// F3 #197: usunięcie posta odpala po jednym fire-and-forget YouTube delete na wideo;
// błąd YouTube (symulowany przez mock) nie wpływa na odpowiedź.
describe("DELETE /api/app/posts/:id — kaskada YouTube (F3 #197)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifyPostFileKeys.mockResolvedValue({ ok: true, data: undefined });
		mockSyncPostFiles.mockResolvedValue({ ok: true, data: undefined });
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
	});

	it("fires one YouTube delete per video and still succeeds", async () => {
		mockGetPost.mockResolvedValue({
			...samplePost,
			videos: [
				{ youtubeVideoId: "yt-1", title: "Pierwsze", thumbnailUrl: "https://t/1" },
				{ youtubeVideoId: "yt-2", title: "Drugie", thumbnailUrl: "https://t/2" },
			],
		});
		mockSoftDelete.mockResolvedValue({ ...samplePost, deletedAt: new Date() });
		const executionCtx = {
			waitUntil: () => {},
			passThroughOnException: () => {},
		} as unknown as ExecutionContext;

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", { method: "DELETE" }),
			env,
			executionCtx,
		);

		expect(res.status).toBe(200);
		expect(fireAndForgetYoutubeDelete).toHaveBeenCalledTimes(2);
		expect(fireAndForgetYoutubeDelete).toHaveBeenCalledWith(executionCtx, env, "yt-1");
		expect(fireAndForgetYoutubeDelete).toHaveBeenCalledWith(executionCtx, env, "yt-2");
	});

	it("post without videos fires no YouTube deletes", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockSoftDelete.mockResolvedValue({ ...samplePost, deletedAt: new Date() });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", { method: "DELETE" }),
			env,
			{ waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext,
		);

		expect(res.status).toBe(200);
		expect(fireAndForgetYoutubeDelete).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// #241 — ankiety w postach: create/update/vote (kontrakt z ticketu)
// ---------------------------------------------------------------------------

describe("POST /api/app/posts — ankieta (#241)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCountToday.mockResolvedValue(0);
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
	});

	async function create(body: unknown, postEnv = env) {
		const api = createApi();
		return api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}),
			postEnv,
		);
	}

	it("tworzy post z poprawną ankietą — payload zapisany", async () => {
		const poll = { question: "Gdzie na wakacje?", options: ["Morze", "Góry"] };
		const res = await create({ description: "Test", poll });

		expect(res.status).toBe(201);
		expect(mockCreatePost).toHaveBeenCalledWith(expect.objectContaining({ poll }));
	});

	it.each([
		["1 opcja", { question: "Pytanie", options: ["Jedna"] }],
		[
			"7 opcji",
			{ question: "Pytanie", options: Array.from({ length: 7 }, (_, i) => `Opcja ${i + 1}`) },
		],
		["pusta opcja", { question: "Pytanie", options: ["A", "  "] }],
		["opcja >100 znaków", { question: "Pytanie", options: ["A", "x".repeat(101)] }],
		["pytanie >200 znaków", { question: "x".repeat(201), options: ["A", "B"] }],
	])("odrzuca ankietę (%s) → 400", async (_name, poll) => {
		const res = await create({ poll });
		expect(res.status).toBe(400);
		expect(mockCreatePost).not.toHaveBeenCalled();
	});
});

describe("PATCH /api/app/posts/:id — pole poll całkowicie ignorowane (#241)", () => {
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
			aiOptIn: false,
			aiBlocked: false,
		});
	});

	it("update z polem poll nie zmienia ankiety (i nawet nie waliduje jej kształtu)", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockUpdatePost.mockResolvedValue(samplePost);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				// poll celowo BEZNADZIEJNIE zepsuty — update ma go zignorować, nie odrzucić
				body: JSON.stringify({ poll: { question: "", options: [] } }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockUpdatePost).toHaveBeenCalledWith(
			"post-1",
			expect.not.objectContaining({ poll: expect.anything() }),
		);
	});
});

describe("POST /api/app/posts/:id/poll/vote (#241)", () => {
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
			aiOptIn: false,
			aiBlocked: false,
		});
	});

	async function vote(body: unknown, pollEnv = env) {
		const api = createApi();
		return api.request(
			"/api/app/posts/post-1/poll/vote",
			authedRequest("/api/app/posts/post-1/poll/vote", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}),
			pollEnv,
		);
	}

	it("głos → 200 z counts i myVoteIndex, bez id innych głosujących", async () => {
		mockVoteOnPostPoll.mockResolvedValue({
			ok: true,
			data: { counts: [2, 1], myVoteIndex: 0 },
		});

		const res = await vote({ optionIndex: 0 });

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Record<string, unknown> };
		expect(body.data).toEqual({ counts: [2, 1], myVoteIndex: 0 });
		const json = JSON.stringify(body);
		expect(json).not.toContain("userId");
		expect(json).not.toContain('"u');
		expect(mockVoteOnPostPoll).toHaveBeenCalledWith("post-1", "u1", 0);
	});

	it("nieprawidłowy indeks → 400", async () => {
		const res = await vote({ optionIndex: -1 });
		expect(res.status).toBe(400);
		expect(mockVoteOnPostPoll).not.toHaveBeenCalled();
	});

	it("indeks niecałkowity → 400", async () => {
		const res = await vote({ optionIndex: 1.5 });
		expect(res.status).toBe(400);
	});

	it("błąd domeny mapuje się na jej status (404 brak posta / 400 brak ankiety)", async () => {
		mockVoteOnPostPoll.mockResolvedValue({
			ok: false,
			error: {
				message: "Ten post nie ma ankiety",
				code: "VALIDATION",
				status: 400,
				name: "AppError",
			} as never,
		});
		const res = await vote({ optionIndex: 0 });
		expect(res.status).toBe(400);

		mockVoteOnPostPoll.mockResolvedValue({
			ok: false,
			error: {
				message: "Post nie istnieje",
				code: "NOT_FOUND",
				status: 404,
				name: "AppError",
			} as never,
		});
		const res2 = await vote({ optionIndex: 0 });
		expect(res2.status).toBe(404);
	});

	it("401 bez sesji", async () => {
		mockVerify.mockResolvedValue(null);
		const res = await vote({ optionIndex: 0 });
		expect(res.status).toBe(401);
	});
});

// ---------------------------------------------------------------------------
// #242 — lokalizacja w postach: create/update (zakresy geo, label opcjonalny)
// ---------------------------------------------------------------------------

describe("POST/PATCH /api/app/posts — lokalizacja (#242)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCountToday.mockResolvedValue(0);
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
	});

	async function create(body: unknown) {
		const api = createApi();
		return api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}),
			env,
		);
	}

	async function patch(body: unknown) {
		mockGetPost.mockResolvedValue(samplePost);
		mockUpdatePost.mockResolvedValue(samplePost);
		const api = createApi();
		return api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}),
			env,
		);
	}

	it("tworzy post z poprawną lokalizacją (z etykietą)", async () => {
		const location = { lat: 52.23, lng: 21.01, label: "Domek babci" };
		const res = await create({ description: "Test", location });
		expect(res.status).toBe(201);
		expect(mockCreatePost).toHaveBeenCalledWith(expect.objectContaining({ location }));
	});

	it("lokalizacja bez etykiety jest OK", async () => {
		const location = { lat: 52.23, lng: 21.01 };
		const res = await create({ description: "Test", location });
		expect(res.status).toBe(201);
		expect(mockCreatePost).toHaveBeenCalledWith(expect.objectContaining({ location }));
	});

	it.each([
		["lat poza zakresem", { lat: 91, lng: 0 }],
		["lng poza zakresem", { lat: 0, lng: -181 }],
		["label >200 znaków", { lat: 0, lng: 0, label: "x".repeat(201) }],
	])("odrzuca lokalizację (%s) → 400", async (_name, location) => {
		const res = await create({ description: "Test", location });
		expect(res.status).toBe(400);
		expect(mockCreatePost).not.toHaveBeenCalled();
	});

	it("PATCH ze nową lokalizacją → updatePost dostaje obiekt", async () => {
		const location = { lat: 50.0, lng: 20.0, label: "Nówka sztuka" };
		const res = await patch({ description: "Test", location });
		expect(res.status).toBe(200);
		expect(mockUpdatePost).toHaveBeenCalledWith("post-1", expect.objectContaining({ location }));
	});

	it("PATCH z null usuwa lokalizację", async () => {
		const res = await patch({ description: "Test", location: null });
		expect(res.status).toBe(200);
		expect(mockUpdatePost).toHaveBeenCalledWith(
			"post-1",
			expect.objectContaining({ location: null }),
		);
	});

	it("PATCH bez pola location → undefined (bez zmian)", async () => {
		const res = await patch({ description: "Test" });
		expect(res.status).toBe(200);
		expect(mockUpdatePost).toHaveBeenCalledWith(
			"post-1",
			expect.objectContaining({ location: undefined }),
		);
	});
});

// ---------------------------------------------------------------------------
// #243 — pliki w postach: attach przy create/update, download, cleanup
// ---------------------------------------------------------------------------

const FILE_META = {
	key: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
	name: "dokument.pdf",
	size: 123,
	mimeType: "application/pdf",
};

describe("POST /api/app/posts — attach plików (#243)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCountToday.mockResolvedValue(0);
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
	});

	it("create z plikami → head w R2 + attach po utworzeniu", async () => {
		const postEnv = { ...env, POST_FILES: r2Stub() };
		const res = await (async () => {
			const api = createApi();
			return api.request(
				"/api/app/posts",
				authedRequest("/api/app/posts", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ description: "Test", files: [FILE_META] }),
				}),
				postEnv,
			);
		})();

		expect(res.status).toBe(201);
		expect(mockVerifyPostFileKeys).toHaveBeenCalledWith(postEnv.POST_FILES, [FILE_META.key]);
		expect(mockAttachPostFiles).toHaveBeenCalledWith(expect.any(String), [FILE_META]);
	});

	it("6 plików → 400 (limit 5, walidacja schematu)", async () => {
		const files = Array.from({ length: 6 }, (_, i) => ({
			...FILE_META,
			key: `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeeee${i}`,
		}));
		const api = createApi();
		const res = await api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: "Test", files }),
			}),
			env,
		);
		expect(res.status).toBe(400);
	});

	it("klucz nieznany (brak w R2) → 400", async () => {
		const postEnv = { ...env, POST_FILES: { head: vi.fn(async () => null) } };
		mockVerifyPostFileKeys.mockResolvedValue({
			ok: false,
			error: {
				message: "Plik nie został znaleziony — spróbuj wysłać go ponownie",
				code: "VALIDATION",
				status: 400,
				name: "AppError",
			} as never,
		});
		const api = createApi();
		const res = await api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: "Test", files: [FILE_META] }),
			}),
			postEnv,
		);
		expect(res.status).toBe(400);
		expect(mockAttachPostFiles).not.toHaveBeenCalled();
	});

	it("PATCH z files → syncPostFiles pełną listą; bez pola → sync nie wołany", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockUpdatePost.mockResolvedValue(samplePost);
		const postEnv = { ...env, POST_FILES: r2Stub() };

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ files: [FILE_META] }),
			}),
			postEnv,
		);
		expect(res.status).toBe(200);
		expect(mockSyncPostFiles).toHaveBeenCalledWith(postEnv.POST_FILES, "post-1", [FILE_META]);

		mockSyncPostFiles.mockClear();
		const res2 = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ description: "Bez plików" }),
			}),
			postEnv,
		);
		expect(res2.status).toBe(200);
		expect(mockSyncPostFiles).not.toHaveBeenCalled();
	});
});

describe("GET /api/app/posts/:id/files/:fileId (#243)", () => {
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
			aiOptIn: false,
			aiBlocked: false,
		});
	});

	async function download(fileEnv = env) {
		mockGetPost.mockResolvedValue(samplePost);
		const api = createApi();
		return api.request(
			"/api/app/posts/post-1/files/file-1",
			authedRequest("/api/app/posts/post-1/files/file-1"),
			fileEnv,
		);
	}

	it("401 bez sesji", async () => {
		mockVerify.mockResolvedValue(null);
		mockGetPost.mockResolvedValue(samplePost);
		const api = createApi();
		const res = await api.request("/api/app/posts/post-1/files/file-1", {}, env);
		expect(res.status).toBe(401);
	});

	it("404 gdy plik nie należy do posta", async () => {
		mockGetPostFile.mockResolvedValue(null);
		const res = await download();
		expect(res.status).toBe(404);
	});

	it("200 + bajty z R2 dla zalogowanych (content-type z obiektu)", async () => {
		mockGetPostFile.mockResolvedValue({
			id: "file-1",
			key: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
			name: "dokument.pdf",
			mimeType: "application/pdf",
		});
		const bucket = {
			get: vi.fn(async () => ({
				body: "BINARY-BYTES",
				size: 12,
				httpMetadata: { contentType: "application/pdf" },
			})),
		};
		const res = await download({ ...env, POST_FILES: bucket });

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("BINARY-BYTES");
		expect(res.headers.get("content-type")).toBe("application/pdf");
		expect(bucket.get).toHaveBeenCalledWith("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
	});

	it("404 gdy obiekt zniknął z R2", async () => {
		mockGetPostFile.mockResolvedValue({
			id: "file-1",
			key: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
			name: "dokument.pdf",
			mimeType: "application/pdf",
		});
		const res = await download({ ...env, POST_FILES: r2Stub() });
		expect(res.status).toBe(404);
	});
});

describe("DELETE /api/app/posts/:id — cleanup plików (#243)", () => {
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
			aiOptIn: false,
			aiBlocked: false,
		});
	});

	it("usunięcie posta czyści pliki z bazy i R2", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockSoftDelete.mockResolvedValue({ ...samplePost, deletedAt: new Date() });
		const postEnv = { ...env, POST_FILES: r2Stub() };

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1",
			authedRequest("/api/app/posts/post-1", { method: "DELETE" }),
			postEnv,
		);

		expect(res.status).toBe(200);
		expect(mockPurgePostFiles).toHaveBeenCalledWith(postEnv.POST_FILES, "post-1");
	});
});

// Everything-post (#244): JEDEN request zawiera zdjęcia + wideo + pliki +
// ankietę + lokalizację naraz. Get zwraca wszystkie sekcje; update edytuje
// wszystko POZA ankietą (poll jest celowo poza updatePostSchema — reguła #241).
describe("everything-post (#244)", () => {
	const VIDEOS = [
		{ youtubeVideoId: "yt-1", title: "Klip", thumbnailUrl: "https://i.ytimg.com/vi/yt-1/hq.jpg" },
	];
	const POLL = { question: "Kto jedzie?", options: ["Ja", "Nie ja"] };
	const LOCATION = { lat: 54.4, lng: 18.6, label: "Plaża Stogi" };
	const FILES = [
		{
			key: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
			name: "program.pdf",
			size: 1234,
			mimeType: "application/pdf",
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		mockCountToday.mockResolvedValue(0);
		mockVerifyPostFileKeys.mockResolvedValue({ ok: true, data: undefined });
		mockSyncPostFiles.mockResolvedValue({ ok: true, data: undefined });
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
	});

	it("create ze zdjęciami + wideo + plikami + ankietą + lokalizacją w JEDNYM requeście → 201", async () => {
		const now = new Date();
		mockCreatePost.mockResolvedValue({
			post: {
				id: "post-e1",
				authorId: "u1",
				description: "Everything",
				deletedAt: null,
				createdAt: now,
				updatedAt: now,
				videos: VIDEOS,
				poll: POLL,
				location: LOCATION,
			},
			images: [
				{
					id: "img-1",
					postId: "post-e1",
					cfImageId: "cf-aaa",
					displayOrder: 0,
					createdAt: now,
				},
			],
		});

		const api = createApi();
		const postEnv = { ...env, POST_FILES: r2Stub() };
		const res = await api.request(
			"/api/app/posts",
			authedRequest("/api/app/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					description: "Everything",
					cfImageIds: ["cf-aaa"],
					videos: VIDEOS,
					poll: POLL,
					location: LOCATION,
					files: FILES,
				}),
			}),
			postEnv,
		);

		expect(res.status).toBe(201);
		// Wszystkie elementy lecą w JEDNYM wywołaniu createPost.
		expect(mockCreatePost).toHaveBeenCalledWith({
			authorId: "u1",
			description: "Everything",
			cfImageIds: ["cf-aaa"],
			videos: VIDEOS,
			poll: POLL,
			location: LOCATION,
		});
		// Pliki attachują się do świeżo utworzonego posta (R2 head ok).
		expect(mockAttachPostFiles).toHaveBeenCalledWith("post-e1", FILES);
	});

	it("GET everything-posta zwraca wszystkie sekcje naraz", async () => {
		mockGetPost.mockResolvedValue({
			...samplePost,
			id: "post-e1",
			description: "Everything",
			videos: VIDEOS,
			poll: POLL,
			location: LOCATION,
			files: [{ id: "f1", key: FILES[0].key, name: FILES[0].name, mimeType: FILES[0].mimeType }],
		} as never);
		mockListPinnedIds.mockResolvedValue([]);
		mockEnrichPosts.mockImplementation(async (posts) => posts as never);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-e1",
			authedRequest("/api/app/posts/post-e1"),
			env,
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Record<string, unknown> };
		expect(body.data.videos).toEqual(VIDEOS);
		expect(body.data.poll).toEqual(POLL);
		expect(body.data.location).toEqual(LOCATION);
		expect(body.data.files).toHaveLength(1);
	});

	it("update everything-posta edytuje opis/wideo/lokalizację/pliki, a wysłany poll jest ignorowany", async () => {
		mockGetPost.mockResolvedValue({
			...samplePost,
			id: "post-e1",
			videos: VIDEOS,
			poll: POLL,
		} as never);
		mockUpdatePost.mockResolvedValue({ ...samplePost, id: "post-e1" } as never);

		const api = createApi();
		const postEnv = { ...env, POST_FILES: r2Stub() };
		const res = await api.request(
			"/api/app/posts/post-e1",
			authedRequest("/api/app/posts/post-e1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					description: "Nowy opis",
					videos: VIDEOS,
					location: null,
					files: [],
					poll: { question: "Próba podmiany", options: ["x", "y"] },
				}),
			}),
			postEnv,
		);

		expect(res.status).toBe(200);
		// Poll nie ma wejścia w updatePost — reguła „ankieta zamarza po publikacji".
		expect(mockUpdatePost).toHaveBeenCalledWith(
			"post-e1",
			expect.objectContaining({
				description: "Nowy opis",
				videos: VIDEOS,
				location: null,
			}),
		);
		expect(mockSyncPostFiles).toHaveBeenCalledWith(postEnv.POST_FILES, "post-e1", []);
		expect(mockUpdatePost.mock.calls[0]?.[1]).not.toHaveProperty("poll");
	});
});
