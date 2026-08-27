// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
}));

vi.mock("@/db/albums", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/db/albums")>();
	return {
		...actual,
		createAlbum: vi.fn(),
		listAlbums: vi.fn(),
		getAlbumById: vi.fn(),
	};
});

import { createAlbum, getAlbumById, listAlbums } from "@/db/albums";
import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import albumsEndpoint from "./albums";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockCreateAlbum = vi.mocked(createAlbum);
const mockListAlbums = vi.mocked(listAlbums);
const mockGetAlbumById = vi.mocked(getAlbumById);

function createApi() {
	const api = new Hono<{
		Bindings: { SESSION_SECRET: string; CLOUDFLARE_IMAGES_ACCOUNT_HASH: string };
	}>().basePath("/api/app");
	api.route("/albums", albumsEndpoint);
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

function authedUser() {
	mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
	mockFindUser.mockResolvedValue({
		id: "u1",
		name: "Tomek",
		role: "member",
		tokenHash: "hash",
		deletedAt: null,
		createdAt: now,
	});
}

describe("POST /api/app/albums", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("creates an album and returns 201 with tile data", async () => {
		mockCreateAlbum.mockResolvedValue({
			album: { id: "album-1", creatorId: "u1", title: "Wakacje", createdAt: now },
			items: [
				{
					id: "item-1",
					albumId: "album-1",
					kind: "own_image",
					ref: "cf-1",
					createdAt: now,
				},
			],
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/albums",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Wakacje", photoIds: ["cf-1"] }),
			}),
			env,
		);

		expect(res.status).toBe(201);
		expect(mockCreateAlbum).toHaveBeenCalledWith({
			creatorId: "u1",
			title: "Wakacje",
			photoIds: ["cf-1"],
		});
		const json = (await res.json()) as { data: { id: string; photoCount: number } };
		expect(json.data.id).toBe("album-1");
		expect(json.data.photoCount).toBe(1);
	});

	it("returns 400 for an empty title", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/app/albums",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "", photoIds: ["cf-1"] }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateAlbum).not.toHaveBeenCalled();
	});

	it("returns 400 for a title over 100 characters", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/app/albums",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "a".repeat(101), photoIds: ["cf-1"] }),
			}),
			env,
		);

		expect(res.status).toBe(400);
	});

	it("returns 400 for zero photos", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/app/albums",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Wakacje", photoIds: [] }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateAlbum).not.toHaveBeenCalled();
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/app/albums",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Wakacje", photoIds: ["cf-1"] }),
			},
			env,
		);

		expect(res.status).toBe(401);
	});
});

describe("GET /api/app/albums", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("returns tiles newest-first with the image account hash", async () => {
		mockListAlbums.mockResolvedValue([
			{ id: "album-new", title: "Nowszy", photoCount: 2, coverImageId: "cf-1" },
			{ id: "album-old", title: "Starszy", photoCount: 1, coverImageId: "cf-3" },
		]);

		const api = createApi();
		const res = await api.request("/api/app/albums", authedRequest(), env);

		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			data: { id: string }[];
			meta: { imageAccountHash: string };
		};
		expect(json.data.map((t) => t.id)).toEqual(["album-new", "album-old"]);
		// Kafelki budują URL okładki bez dodatkowego zapytania (wzorzec #127).
		expect(json.meta.imageAccountHash).toBe("hash-1");
	});

	it("returns an empty list when there are no albums", async () => {
		mockListAlbums.mockResolvedValue([]);

		const api = createApi();
		const res = await api.request("/api/app/albums", authedRequest(), env);

		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: unknown[] };
		expect(json.data).toEqual([]);
	});
});

describe("GET /api/app/albums/:id", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("returns the album with items in add order", async () => {
		mockGetAlbumById.mockResolvedValue({
			id: "album-1",
			creatorId: "u1",
			title: "Wakacje",
			createdAt: now,
			items: [
				{ id: "item-1", albumId: "album-1", kind: "own_image", ref: "cf-1", createdAt: now },
				{ id: "item-2", albumId: "album-1", kind: "own_image", ref: "cf-2", createdAt: now },
			],
		});

		const api = createApi();
		const res = await api.request("/api/app/albums/album-1", authedRequest(), env);

		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			data: { id: string; items: { ref: string }[] };
			meta: { imageAccountHash: string };
		};
		expect(json.data.items.map((i) => i.ref)).toEqual(["cf-1", "cf-2"]);
	});

	it("returns 404 when the album does not exist", async () => {
		mockGetAlbumById.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request("/api/app/albums/missing", authedRequest(), env);

		expect(res.status).toBe(404);
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request("/api/app/albums/album-1", {}, env);

		expect(res.status).toBe(401);
	});
});
