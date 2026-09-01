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
	getPostById: vi.fn(),
	listPostsByIds: vi.fn(),
}));

vi.mock("@/db/comments", () => ({
	countCommentsByPosts: vi.fn(),
}));

vi.mock("@/db/videos", () => ({
	listVideosByPostIds: vi.fn(),
}));

vi.mock("@/db/bookmarks", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/db/bookmarks")>();
	return {
		...actual,
		createBookmark: vi.fn(),
		deleteBookmark: vi.fn(),
		listBookmarksForUser: vi.fn(),
	};
});

import { createBookmark, deleteBookmark, listBookmarksForUser } from "@/db/bookmarks";
import { countCommentsByPosts } from "@/db/comments";
import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import { getPostById, listPostsByIds } from "@/db/posts/queries";
import { listVideosByPostIds } from "@/db/videos";
import bookmarksEndpoint from "./bookmarks";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockGetPost = vi.mocked(getPostById);
const mockListPostsByIds = vi.mocked(listPostsByIds);
const mockCreateBookmark = vi.mocked(createBookmark);
const mockDeleteBookmark = vi.mocked(deleteBookmark);
const mockListBookmarks = vi.mocked(listBookmarksForUser);
const mockCountComments = vi.mocked(countCommentsByPosts);
const mockListVideos = vi.mocked(listVideosByPostIds);

function createApi() {
	const api = new Hono<{
		Bindings: { SESSION_SECRET: string; CLOUDFLARE_IMAGES_ACCOUNT_HASH: string };
	}>().basePath("/api/app");
	api.route("/bookmarks", bookmarksEndpoint);
	return api;
}

const env = { SESSION_SECRET: "secret", CLOUDFLARE_IMAGES_ACCOUNT_HASH: "hash-1" };

function authedRequest(init?: RequestInit) {
	return {
		...init,
		headers: { Cookie: "session=valid-jwt", ...init?.headers },
	};
}

const now = new Date();
const samplePost = {
	id: "post-1",
	authorId: "u1",
	description: "Test",
	createdAt: now,
	updatedAt: now,
	author: { id: "u1", name: "Tomek" },
	images: [],
};

function authedUser() {
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
}

describe("POST /api/app/bookmarks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("creates a bookmark for the logged-in user and returns 201", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockCreateBookmark.mockResolvedValue({
			id: "bookmark-1",
			userId: "u1",
			postId: "post-1",
			createdAt: now,
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/bookmarks",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ postId: "post-1" }),
			}),
			env,
		);

		expect(res.status).toBe(201);
		expect(mockCreateBookmark).toHaveBeenCalledWith({ userId: "u1", postId: "post-1" });
	});

	it("returns 201 even when already saved (idempotent)", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockCreateBookmark.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/bookmarks",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ postId: "post-1" }),
			}),
			env,
		);

		expect(res.status).toBe(201);
	});

	it("returns 404 when the post does not exist", async () => {
		mockGetPost.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/bookmarks",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ postId: "missing" }),
			}),
			env,
		);

		expect(res.status).toBe(404);
		expect(mockCreateBookmark).not.toHaveBeenCalled();
	});

	it("returns 400 for invalid body", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/app/bookmarks",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			}),
			env,
		);

		expect(res.status).toBe(400);
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/app/bookmarks",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ postId: "post-1" }),
			},
			env,
		);

		expect(res.status).toBe(401);
	});
});

describe("DELETE /api/app/bookmarks/:postId", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("deletes the user's bookmark and returns 200", async () => {
		mockDeleteBookmark.mockResolvedValue({
			id: "bookmark-1",
			userId: "u1",
			postId: "post-1",
			createdAt: now,
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/bookmarks/post-1",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockDeleteBookmark).toHaveBeenCalledWith("u1", "post-1");
	});

	it("returns 404 when the bookmark does not exist", async () => {
		mockDeleteBookmark.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/bookmarks/post-1",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(404);
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request("/api/app/bookmarks/post-1", { method: "DELETE" }, env);

		expect(res.status).toBe(401);
	});
});

describe("GET /api/app/bookmarks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("returns the logged-in user's saved posts enriched with commentCount + videos", async () => {
		mockListBookmarks.mockResolvedValue([
			{ id: "b2", userId: "u1", postId: "post-2", createdAt: now },
			{ id: "b1", userId: "u1", postId: "post-1", createdAt: now },
		]);
		mockListPostsByIds.mockResolvedValue([samplePost]);
		mockCountComments.mockResolvedValue(new Map([["post-1", 5]]));
		mockListVideos.mockResolvedValue(
			new Map([
				[
					"post-1",
					[
						{
							id: "vid-1",
							youtubeVideoId: "yt-1",
							title: "Wakacje",
							description: null,
							authorId: "u1",
							thumbnailUrl: "https://i.ytimg.com/vi/yt-1/default.jpg",
							createdAt: now,
							position: 0,
							author: { id: "u1", name: "Tomek" },
						},
					],
				],
			]),
		);

		const api = createApi();
		const res = await api.request("/api/app/bookmarks", authedRequest(), env);

		expect(res.status).toBe(200);
		// listPostsByIds wołane z postIds w kolejności zapisu (DESC).
		expect(mockListPostsByIds).toHaveBeenCalledWith(["post-2", "post-1"]);
		const json = (await res.json()) as {
			data: { id: string; commentCount: number; videos: { id: string }[] }[];
			meta: { imageAccountHash: string };
		};
		expect(json.data).toHaveLength(1);
		// PostCard w Bibliotece potrzebuje hasha konta do budowy URL-i zdjęć (#127).
		expect(json.meta.imageAccountHash).toBe("hash-1");
		// Enrichment jak w feedzie — żeby Biblioteka wyglądała identycznie (#127).
		expect(json.data[0]?.commentCount).toBe(5);
		expect(json.data[0]?.videos).toHaveLength(1);
	});

	it("returns an empty array when the user has no bookmarks", async () => {
		mockListBookmarks.mockResolvedValue([]);
		mockListPostsByIds.mockResolvedValue([]);

		const api = createApi();
		const res = await api.request("/api/app/bookmarks", authedRequest(), env);

		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: unknown[] };
		expect(json.data).toEqual([]);
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request("/api/app/bookmarks", {}, env);

		expect(res.status).toBe(401);
	});
});

describe("Authorization — own bookmarks only (#132)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("GET derives userId from the session, never from the request", async () => {
		// Sesja = user u1. Niezależnie od treści żądania, listBookmarksForUser
		// musi dostać userId z sesji (u1) — nie da się wyciągnąć zakładek usera u2.
		mockListBookmarks.mockResolvedValue([]);
		mockListPostsByIds.mockResolvedValue([]);

		const api = createApi();
		// Próba „manipulacji": dowolny body/query nie zmienia userId.
		const res = await api.request("/api/app/bookmarks?userId=u2", authedRequest(), env);

		expect(res.status).toBe(200);
		expect(mockListBookmarks).toHaveBeenCalledWith("u1");
		expect(mockListBookmarks).not.toHaveBeenCalledWith("u2");
	});

	it("DELETE is scoped to the session user — cannot remove another user's bookmark", async () => {
		// Endpoint przyjmuje tylko :postId; userId zawsze z sesji. deleteBookmark
		// wołane jest z ("u1", postId) — scoped WHERE gwarantuje, że user u1
		// nigdy nie usunie zakładki usera u2.
		mockDeleteBookmark.mockResolvedValue({
			id: "bookmark-1",
			userId: "u1",
			postId: "post-1",
			createdAt: now,
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/bookmarks/post-1",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockDeleteBookmark).toHaveBeenCalledWith("u1", "post-1");
	});

	it("DELETE for a post the user never bookmarked returns 404 (no leak of others' bookmarks)", async () => {
		// User u1 nie ma zakładki post-9 → scoped delete nie znajduje wiersza.
		// To jedyna „obrona": nie ma jak wskazać cudzej zakładki, więc 403 jest
		// z konstrukcji nieosiągalne; zamiast tego 404 (nie ujawnia istnienia).
		mockDeleteBookmark.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/bookmarks/post-9",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(404);
		expect(mockDeleteBookmark).toHaveBeenCalledWith("u1", "post-9");
	});
});
