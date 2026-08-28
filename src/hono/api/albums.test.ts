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
		addAlbumItems: vi.fn(),
		createAlbum: vi.fn(),
		listAddableAlbums: vi.fn(),
		listAlbums: vi.fn(),
		getAlbumById: vi.fn(),
	};
});

import {
	addAlbumItems,
	createAlbum,
	getAlbumById,
	listAddableAlbums,
	listAlbums,
} from "@/db/albums";
import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import albumsEndpoint from "./albums";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockCreateAlbum = vi.mocked(createAlbum);
const mockListAlbums = vi.mocked(listAlbums);
const mockGetAlbumById = vi.mocked(getAlbumById);
const mockAddAlbumItems = vi.mocked(addAlbumItems);
const mockListAddableAlbums = vi.mocked(listAddableAlbums);

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

function adminUser() {
	mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "admin" });
	mockFindUser.mockResolvedValue({
		id: "u1",
		name: "Tomek",
		role: "admin",
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
			{ id: "album-new", title: "Nowszy", photoCount: 2, videoCount: 0, coverImageId: "cf-1" },
			{ id: "album-old", title: "Starszy", photoCount: 1, videoCount: 0, coverImageId: "cf-3" },
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
				{
					id: "item-1",
					albumId: "album-1",
					kind: "own_image",
					ref: "cf-1",
					createdAt: now,
					video: null,
				},
				{
					id: "item-2",
					albumId: "album-1",
					kind: "own_image",
					ref: "cf-2",
					createdAt: now,
					video: null,
				},
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

// Założenia kontraktu (#171/#172):
// - GET /?addable=1: sesja decyduje — członek dostaje własne albumy (isAdmin
//   false), admin wszystkie (isAdmin true); zwykłe GET tego parametru nie dotyka.
// - POST /:id/items: 404 brak albumu; 403 nie-twórca i nie-admin; 201 z liczbą
//   dodanych (duplikat po stronie DB = mniej wierszy, wciąż 201 — cichy no-op).
describe("GET /api/app/albums?addable=1", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("passes isAdmin=false for a member and returns the addable list", async () => {
		mockListAddableAlbums.mockResolvedValue([{ id: "a1", title: "Wakacje" }]);

		const api = createApi();
		const res = await api.request("/api/app/albums?addable=1", authedRequest(), env);

		expect(res.status).toBe(200);
		expect(mockListAddableAlbums).toHaveBeenCalledWith({ userId: "u1", isAdmin: false });
		const json = (await res.json()) as { data: { id: string; title: string }[] };
		expect(json.data).toEqual([{ id: "a1", title: "Wakacje" }]);
	});

	it("passes isAdmin=true for an admin", async () => {
		vi.clearAllMocks();
		adminUser();
		mockListAddableAlbums.mockResolvedValue([{ id: "a2", title: "Cudze" }]);

		const api = createApi();
		const res = await api.request("/api/app/albums?addable=1", authedRequest(), env);

		expect(res.status).toBe(200);
		expect(mockListAddableAlbums).toHaveBeenCalledWith({ userId: "u1", isAdmin: true });
	});

	it("serves the full tile list when the addable param is absent", async () => {
		mockListAlbums.mockResolvedValue([]);

		const api = createApi();
		const res = await api.request("/api/app/albums", authedRequest(), env);

		expect(res.status).toBe(200);
		expect(mockListAddableAlbums).not.toHaveBeenCalled();
		expect(mockListAlbums).toHaveBeenCalledTimes(1);
	});
});

describe("POST /api/app/albums/:id/items", () => {
	const itemsBody = { kind: "post_photo", refs: ["cf-9"] };

	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("adds an item as the album creator and returns 201 with the added count", async () => {
		mockGetAlbumById.mockResolvedValue({
			id: "album-1",
			creatorId: "u1",
			title: "Wakacje",
			createdAt: now,
			items: [],
		});
		mockAddAlbumItems.mockResolvedValue([
			{ id: "item-9", albumId: "album-1", kind: "post_photo", ref: "cf-9", createdAt: now },
		]);

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1/items",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(itemsBody),
			}),
			env,
		);

		expect(res.status).toBe(201);
		expect(mockAddAlbumItems).toHaveBeenCalledWith({
			albumId: "album-1",
			kind: "post_photo",
			refs: ["cf-9"],
		});
		const json = (await res.json()) as { data: { added: number } };
		expect(json.data.added).toBe(1);
	});

	it("returns 404 when the album does not exist", async () => {
		mockGetAlbumById.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/missing/items",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(itemsBody),
			}),
			env,
		);

		expect(res.status).toBe(404);
		expect(mockAddAlbumItems).not.toHaveBeenCalled();
	});

	it("returns 403 for a non-creator non-admin", async () => {
		mockGetAlbumById.mockResolvedValue({
			id: "album-1",
			creatorId: "u-other",
			title: "Cudze",
			createdAt: now,
			items: [],
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1/items",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(itemsBody),
			}),
			env,
		);

		expect(res.status).toBe(403);
		expect(mockAddAlbumItems).not.toHaveBeenCalled();
	});

	it("lets an admin add to any album", async () => {
		vi.clearAllMocks();
		adminUser();
		mockGetAlbumById.mockResolvedValue({
			id: "album-1",
			creatorId: "u-other",
			title: "Cudze",
			createdAt: now,
			items: [],
		});
		mockAddAlbumItems.mockResolvedValue([]);

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1/items",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ kind: "video", refs: ["yt-1"] }),
			}),
			env,
		);

		expect(res.status).toBe(201);
		expect(mockAddAlbumItems).toHaveBeenCalledWith({
			albumId: "album-1",
			kind: "video",
			refs: ["yt-1"],
		});
	});

	it("returns 400 for an invalid kind or empty refs", async () => {
		mockGetAlbumById.mockResolvedValue({
			id: "album-1",
			creatorId: "u1",
			title: "Wakacje",
			createdAt: now,
			items: [],
		});

		const api = createApi();

		for (const body of [
			{ kind: "hologram", refs: ["cf-9"] },
			{ kind: "post_photo", refs: [] },
		]) {
			const res = await api.request(
				"/api/app/albums/album-1/items",
				authedRequest({
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}),
				env,
			);
			expect(res.status).toBe(400);
		}
		expect(mockAddAlbumItems).not.toHaveBeenCalled();
	});
});
