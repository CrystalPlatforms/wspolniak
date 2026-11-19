// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Założenia kodowane przez te testy (stan przed RED):
 * - GET /api/search?q=<fraza> — endpoint wyszukiwarki dla strony /app/search.
 * - Gating: authMiddleware — brak/nieprawidłowa sesja → 401.
 * - Walidacja q: brak lub puste po trim → 400 „Podaj frazę do wyszukania";
 *   max 200 znaków → dłuższe → 400.
 * - Limit wyników stały po stronie serwera: posts 12, comments 12, albums 12
 *   (jedna strona wyników, bez paginacji — rodzinna skala).
 * - Sukces 200 { data: { posts, comments, albums } } — trzy wyszukiwania
 *   równolegle (Promise.all), każde z własnym modułem domeny.
 * - Mockujemy wyłącznie granice: moduły DB (identity, posts, comments, albums)
 *   i sesję JWT. Świadomie NIE testowane: prawdziwy SQL, UI strony (HITL).
 */

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
}));

vi.mock("@/db/posts", () => ({
	searchPosts: vi.fn(),
}));

vi.mock("@/db/comments", () => ({
	searchComments: vi.fn(),
}));

vi.mock("@/db/albums", () => ({
	searchAlbums: vi.fn(),
}));

import { Hono } from "hono";
import { searchAlbums } from "@/db/albums";
import { searchComments } from "@/db/comments";
import { findActiveUserById } from "@/db/identity/queries";
import { SESSION_COOKIE_NAME, verifySessionCookie } from "@/db/identity/session";
import { searchPosts } from "@/db/posts";
import searchEndpoint from "./search";

const mockVerifySessionCookie = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockSearchPosts = vi.mocked(searchPosts);
const mockSearchComments = vi.mocked(searchComments);
const mockSearchAlbums = vi.mocked(searchAlbums);

describe("search endpoint", () => {
	const ENV = { SESSION_SECRET: "secret", CLOUDFLARE_IMAGES_ACCOUNT_HASH: "imghash" };

	function createApi() {
		const api = new Hono<{ Bindings: typeof ENV }>().basePath("/api");
		api.route("/app/search", searchEndpoint);
		return api;
	}

	function memberHeaders() {
		return { Cookie: `${SESSION_COOKIE_NAME}=valid-jwt` };
	}

	/** Sesja OK, wyszukiwania zwracają to co dostaną w mockach. */
	function allowMember() {
		mockVerifySessionCookie.mockResolvedValue({
			userId: "u1",
			name: "Członek",
			role: "member",
		});
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Członek",
			role: "member",
			aiBlocked: false,
		} as never);
		mockSearchPosts.mockResolvedValue([]);
		mockSearchComments.mockResolvedValue([]);
		mockSearchAlbums.mockResolvedValue([]);
	}

	it("bez sesji → 401", async () => {
		mockVerifySessionCookie.mockResolvedValue(null);
		const res = await createApi().request("/api/app/search?q=wakacje", { headers: {} }, ENV);
		expect(res.status).toBe(401);
	});

	it("brak q → 400 z polskim komunikatem", async () => {
		allowMember();
		const res = await createApi().request("/api/app/search", { headers: memberHeaders() }, ENV);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Podaj frazę do wyszukania");
	});

	it("puste/whitespace q → 400", async () => {
		allowMember();
		const res = await createApi().request(
			"/api/app/search?q=%20%20",
			{
				headers: memberHeaders(),
			},
			ENV,
		);
		expect(res.status).toBe(400);
	});

	it("q dłuższe niż 200 znaków → 400", async () => {
		allowMember();
		const res = await createApi().request(
			`/api/app/search?q=${"a".repeat(201)}`,
			{
				headers: memberHeaders(),
			},
			ENV,
		);
		expect(res.status).toBe(400);
	});

	it("sukces → 200 z grupami posts/comments/albums (równolegle)", async () => {
		allowMember();
		const post = {
			id: "p1",
			description: "Wakacje",
			authorName: "Mama",
			createdAt: new Date("2026-09-01T12:00:00Z"),
			cfImageId: null,
		};
		mockSearchPosts.mockResolvedValue([post]);
		const res = await createApi().request(
			"/api/app/search?q=wakacje",
			{
				headers: memberHeaders(),
			},
			ENV,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			data: { posts: { id: string }[]; comments: unknown[]; albums: unknown[] };
			meta: { imageAccountHash: string };
		};
		expect(body.data.posts).toHaveLength(1);
		expect(body.data.posts[0].id).toBe("p1");
		expect(body.data.comments).toEqual([]);
		expect(body.data.albums).toEqual([]);
		expect(body.meta.imageAccountHash).toBe("imghash");
	});

	it("limit 12 na grupę — przekazuje limit do funkcji domenowych", async () => {
		allowMember();
		await createApi().request("/api/app/search?q=wakacje", { headers: memberHeaders() }, ENV);
		expect(mockSearchPosts).toHaveBeenCalledWith("wakacje", 12);
		expect(mockSearchComments).toHaveBeenCalledWith("wakacje", 12);
		expect(mockSearchAlbums).toHaveBeenCalledWith("wakacje", 12);
	});
});
