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
		getNewestAlbumCreatedAt: vi.fn(),
		renameAlbum: vi.fn(),
		setAlbumCover: vi.fn(),
		deleteAlbum: vi.fn(),
		removeAlbumItem: vi.fn(),
	};
});

import {
	addAlbumItems,
	createAlbum,
	deleteAlbum,
	getAlbumById,
	getNewestAlbumCreatedAt,
	listAddableAlbums,
	listAlbums,
	removeAlbumItem,
	renameAlbum,
	setAlbumCover,
} from "@/db/albums";
import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import { deleteCfImages } from "@/images/client";
import albumsEndpoint from "./albums";

vi.mock("@/images/client", () => ({
	deleteCfImages: vi.fn(),
	getImageUrl: vi.fn(),
}));

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockCreateAlbum = vi.mocked(createAlbum);
const mockListAlbums = vi.mocked(listAlbums);
const mockGetAlbumById = vi.mocked(getAlbumById);
const mockGetNewestAlbumCreatedAt = vi.mocked(getNewestAlbumCreatedAt);
const mockAddAlbumItems = vi.mocked(addAlbumItems);
const mockListAddableAlbums = vi.mocked(listAddableAlbums);
const mockRenameAlbum = vi.mocked(renameAlbum);
const mockSetAlbumCover = vi.mocked(setAlbumCover);
const mockDeleteAlbum = vi.mocked(deleteAlbum);
const mockRemoveAlbumItem = vi.mocked(removeAlbumItem);
const mockDeleteCfImages = vi.mocked(deleteCfImages);

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
			album: {
				id: "album-1",
				creatorId: "u1",
				title: "Wakacje",
				coverItemId: null,
				createdAt: now,
			},
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
			{
				id: "album-new",
				title: "Nowszy",
				creatorId: "u1",
				photoCount: 2,
				videoCount: 0,
				coverImageId: "cf-1",
			},
			{
				id: "album-old",
				title: "Starszy",
				creatorId: "u1",
				photoCount: 1,
				videoCount: 0,
				coverImageId: "cf-3",
			},
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
			coverItemId: null,
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
			coverItemId: null,
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
			coverItemId: null,
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
			coverItemId: null,
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
			coverItemId: null,
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

// Założenia kontraktu (#173):
// - PATCH: 404 brak albumu, 403 nie-twórca i nie-admin, 400 złe dane (tytuł
//   pusty/>100, brak obu pól); okładka musi być ZDJĘCIEM z TEGO albumu.
// - DELETE /:id: CF Images czyszczone PRZED bazą; response = id + deletedImageIds
//   (tylko own_image). Pożyczone post_photo/video nigdy nie trafiają do czyszczenia.
// - DELETE /:id/items/:itemId: usuwa element, źródło (post/wideo) nietknięte.
describe("PATCH /api/app/albums/:id", () => {
	const creatorDetail = {
		id: "album-1",
		creatorId: "u1",
		title: "Wakacje",
		coverItemId: null,
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
				kind: "video",
				ref: "yt-1",
				createdAt: now,
				video: {
					id: "yt-1",
					title: "Fiesta",
					thumbnailUrl: "https://img/yt-1",
					youtubeVideoId: "abc123",
				},
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("renames the album as the creator and returns 200", async () => {
		mockGetAlbumById.mockResolvedValue(creatorDetail);
		mockRenameAlbum.mockResolvedValue({
			id: "album-1",
			creatorId: "u1",
			title: "Chorwacja",
			coverItemId: null,
			createdAt: now,
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1",
			authedRequest({
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Chorwacja" }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockRenameAlbum).toHaveBeenCalledWith("album-1", "Chorwacja");
	});

	it("sets the cover to a photo item of this album", async () => {
		mockGetAlbumById.mockResolvedValue(creatorDetail);
		mockSetAlbumCover.mockResolvedValue({
			id: "album-1",
			creatorId: "u1",
			title: "Wakacje",
			coverItemId: "item-1",
			createdAt: now,
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1",
			authedRequest({
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ coverItemId: "item-1" }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockSetAlbumCover).toHaveBeenCalledWith("album-1", "item-1");
	});

	it("rejects a video cover with 400", async () => {
		mockGetAlbumById.mockResolvedValue(creatorDetail);

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1",
			authedRequest({
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ coverItemId: "item-2" }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockSetAlbumCover).not.toHaveBeenCalled();
	});

	it("rejects a cover pointing outside the album with 400", async () => {
		mockGetAlbumById.mockResolvedValue(creatorDetail);

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1",
			authedRequest({
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ coverItemId: "item-999" }),
			}),
			env,
		);

		expect(res.status).toBe(400);
	});

	it("returns 403 for a non-creator non-admin", async () => {
		mockGetAlbumById.mockResolvedValue({
			...creatorDetail,
			creatorId: "u-other",
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1",
			authedRequest({
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Hakujemy" }),
			}),
			env,
		);

		expect(res.status).toBe(403);
		expect(mockRenameAlbum).not.toHaveBeenCalled();
	});

	it("lets an admin rename someone else's album", async () => {
		vi.clearAllMocks();
		adminUser();
		mockGetAlbumById.mockResolvedValue({ ...creatorDetail, creatorId: "u-other" });
		mockRenameAlbum.mockResolvedValue({
			id: "album-1",
			creatorId: "u-other",
			title: "Zmienione przez admina",
			coverItemId: null,
			createdAt: now,
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1",
			authedRequest({
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Zmienione przez admina" }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockRenameAlbum).toHaveBeenCalledWith("album-1", "Zmienione przez admina");
	});

	it("returns 404 when the album does not exist", async () => {
		mockGetAlbumById.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/missing",
			authedRequest({
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Cokolwiek" }),
			}),
			env,
		);

		expect(res.status).toBe(404);
	});

	it("returns 400 for an empty body (no title, no cover)", async () => {
		mockGetAlbumById.mockResolvedValue(creatorDetail);

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1",
			authedRequest({
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			}),
			env,
		);

		expect(res.status).toBe(400);
	});
});

describe("DELETE /api/app/albums/:id", () => {
	const ownPhoto = {
		id: "item-1",
		albumId: "album-1",
		kind: "own_image",
		ref: "cf-own-1",
		createdAt: now,
		video: null,
	};
	const borrowedPhoto = {
		id: "item-2",
		albumId: "album-1",
		kind: "post_photo",
		ref: "cf-post-1",
		createdAt: now,
		video: null,
	};
	const borrowedVideo = {
		id: "item-3",
		kind: "video",
		albumId: "album-1",
		ref: "yt-1",
		createdAt: now,
		video: {
			id: "yt-1",
			title: "Fiesta",
			thumbnailUrl: "https://img/yt-1",
			youtubeVideoId: "abc123",
		},
	};
	const detail = {
		id: "album-1",
		creatorId: "u1",
		title: "Wakacje",
		coverItemId: null,
		createdAt: now,
		items: [ownPhoto, borrowedPhoto, borrowedVideo],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("deletes own images from CF before the DB and returns their ids", async () => {
		mockGetAlbumById.mockResolvedValue(detail);
		mockDeleteAlbum.mockResolvedValue(["cf-own-1"]);

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		// CF najpierw, dopiero potem baza (wzorzec z usuwania wideo: YT → Neon).
		expect(mockDeleteCfImages).toHaveBeenCalledTimes(1);
		expect(mockDeleteCfImages.mock.invocationCallOrder[0]).toBeLessThan(
			mockDeleteAlbum.mock.invocationCallOrder[0],
		);
		expect(mockDeleteAlbum).toHaveBeenCalledWith("album-1");
		const json = (await res.json()) as { data: { id: string; deletedImageIds: string[] } };
		expect(json.data.deletedImageIds).toEqual(["cf-own-1"]);
	});

	it("returns 403 for a non-creator non-admin without touching CF or DB", async () => {
		mockGetAlbumById.mockResolvedValue({ ...detail, creatorId: "u-other" });

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(403);
		expect(mockDeleteCfImages).not.toHaveBeenCalled();
		expect(mockDeleteAlbum).not.toHaveBeenCalled();
	});

	it("lets an admin delete someone else's album", async () => {
		vi.clearAllMocks();
		adminUser();
		mockGetAlbumById.mockResolvedValue({ ...detail, creatorId: "u-other" });
		mockDeleteAlbum.mockResolvedValue([]);

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockDeleteAlbum).toHaveBeenCalledWith("album-1");
	});

	it("returns 404 when the album does not exist", async () => {
		mockGetAlbumById.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/missing",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(404);
		expect(mockDeleteAlbum).not.toHaveBeenCalled();
	});
});

describe("DELETE /api/app/albums/:id/items/:itemId", () => {
	const detail = {
		id: "album-1",
		creatorId: "u1",
		title: "Wakacje",
		coverItemId: null,
		createdAt: now,
		items: [
			{
				id: "item-1",
				albumId: "album-1",
				kind: "post_photo",
				ref: "cf-post-1",
				createdAt: now,
				video: null,
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("removes a borrowed item; the source post is untouched", async () => {
		mockGetAlbumById.mockResolvedValue(detail);
		mockRemoveAlbumItem.mockResolvedValue({
			id: "item-1",
			albumId: "album-1",
			kind: "post_photo",
			ref: "cf-post-1",
			createdAt: now,
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1/items/item-1",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockRemoveAlbumItem).toHaveBeenCalledWith("album-1", "item-1");
	});

	it("returns 403 for a non-creator non-admin", async () => {
		mockGetAlbumById.mockResolvedValue({ ...detail, creatorId: "u-other" });

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1/items/item-1",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(403);
		expect(mockRemoveAlbumItem).not.toHaveBeenCalled();
	});

	it("lets an admin remove an item from someone else's album", async () => {
		vi.clearAllMocks();
		adminUser();
		mockGetAlbumById.mockResolvedValue({ ...detail, creatorId: "u-other" });
		mockRemoveAlbumItem.mockResolvedValue({
			id: "item-1",
			albumId: "album-1",
			kind: "post_photo",
			ref: "cf-post-1",
			createdAt: now,
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1/items/item-1",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockRemoveAlbumItem).toHaveBeenCalledWith("album-1", "item-1");
	});

	it("returns 404 when the item is not in the album", async () => {
		mockGetAlbumById.mockResolvedValue(detail);
		mockRemoveAlbumItem.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1/items/nope",
			authedRequest({ method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(404);
		expect(mockRemoveAlbumItem).toHaveBeenCalledWith("album-1", "nope");
	});
});

// Cap 500 (#173): domena rzuca AppError → API mapuje na 400 z polskim komunikatem.
describe("POST /api/app/albums/:id/items — limit 500 (#173)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
		mockGetAlbumById.mockResolvedValue({
			id: "album-1",
			creatorId: "u1",
			title: "Wakacje",
			coverItemId: null,
			createdAt: new Date(),
			items: [],
		});
	});

	it("maps the domain cap error to 400 with the domain message", async () => {
		const { AppError } = await import("@/core/errors");
		mockAddAlbumItems.mockRejectedValue(
			new AppError("Limit albumu to 500 elementów", "VALIDATION", 400),
		);

		const api = createApi();
		const res = await api.request(
			"/api/app/albums/album-1/items",
			authedRequest({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ kind: "own_image", refs: ["cf-1"] }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		const json = (await res.json()) as { error: string };
		expect(json.error).toBe("Limit albumu to 500 elementów");
	});
});

// Założenia F6 (#175): photos.zip streamuje ZIP (metoda store) z największego
// wariantu JPEG; jeden wpis per zdjęcie; nagłówek attachment z nazwą albumu.
describe("GET /api/app/albums/:id/photos.zip (F6 #175)", () => {
	const zipDetail = {
		id: "album-1",
		creatorId: "u1",
		title: "Wakacje",
		coverItemId: null,
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
				kind: "post_photo",
				ref: "cf-2",
				createdAt: now,
				video: null,
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		authedUser();
	});

	it("streams a valid ZIP with one entry per photo and proper headers", async () => {
		mockGetAlbumById.mockResolvedValue(zipDetail);
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
		const fetchMock = vi.fn().mockImplementation(async () => new Response(jpeg, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const api = createApi();
		const res = await api.request("/api/app/albums/album-1/photos.zip", authedRequest(), env);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("application/zip");
		const disposition = res.headers.get("content-disposition") ?? "";
		expect(disposition).toContain("attachment");
		expect(disposition).toContain(".zip");
		expect(disposition).toContain("UTF-8''");
		const bytes = new Uint8Array(await res.arrayBuffer());
		// Magic number ZIP (PKx0304) — poprawna struktura archiwum.
		expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
		// Jeden wpis per zdjęcie: liczba lokalnych nagłówków (0x50 0x4b 0x03 0x04).
		let entries = 0;
		for (let i = 0; i + 3 < bytes.length; i++) {
			if (
				bytes[i] === 0x50 &&
				bytes[i + 1] === 0x4b &&
				bytes[i + 2] === 0x03 &&
				bytes[i + 3] === 0x04
			)
				entries++;
		}
		expect(entries).toBe(2);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("returns 404 when the album does not exist", async () => {
		mockGetAlbumById.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request("/api/app/albums/album-9/photos.zip", authedRequest(), env);

		expect(res.status).toBe(404);
	});

	it("returns 404 when the album has no photos", async () => {
		mockGetAlbumById.mockResolvedValue({
			...zipDetail,
			items: [
				{ id: "v", albumId: "album-1", kind: "video", ref: "yt-1", createdAt: now, video: null },
			],
		});

		const api = createApi();
		const res = await api.request("/api/app/albums/album-1/photos.zip", authedRequest(), env);

		expect(res.status).toBe(404);
	});
});

describe("GET /api/app/albums/:id/videos.html (F6 #175)", () => {
	const videosDetail = {
		id: "album-2",
		creatorId: "u1",
		title: "Chorwacja",
		coverItemId: null,
		createdAt: now,
		items: [
			{
				id: "i1",
				albumId: "album-2",
				kind: "video",
				ref: "v1",
				createdAt: now,
				video: {
					id: "v1",
					title: "Fiesta",
					thumbnailUrl: "https://img/1",
					youtubeVideoId: "abc123",
				},
			},
			{
				id: "i2",
				albumId: "album-2",
				kind: "video",
				ref: "v2",
				createdAt: now,
				video: {
					id: "v2",
					title: "Plaza",
					thumbnailUrl: "https://img/2",
					youtubeVideoId: "xyz789",
				},
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("returns an HTML file with a Polish header and one link per video", async () => {
		mockGetAlbumById.mockResolvedValue(videosDetail);

		const api = createApi();
		const res = await api.request("/api/app/albums/album-2/videos.html", authedRequest(), env);

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		expect(res.headers.get("content-disposition")).toContain(".html");
		const html = await res.text();
		expect(html).toContain('<html lang="pl">');
		expect(html).toContain("Wideo z albumu „Chorwacja”");
		expect(html).toContain("https://www.youtube.com/watch?v=abc123");
		expect(html).toContain("https://www.youtube.com/watch?v=xyz789");
		expect(html).toContain(">Fiesta</a>");
	});

	it("returns 404 when the album has no watchable videos", async () => {
		mockGetAlbumById.mockResolvedValue({
			...videosDetail,
			items: [
				{ id: "i9", albumId: "album-2", kind: "video", ref: "vx", createdAt: now, video: null },
			],
		});

		const api = createApi();
		const res = await api.request("/api/app/albums/album-2/videos.html", authedRequest(), env);

		expect(res.status).toBe(404);
	});
});

// F7 #176: GET /albums/newest — createdAt najnowszego albumu dla kropki „new".
describe("GET /api/app/albums/newest (F7 #176)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("returns the newest album createdAt", async () => {
		const stamp = new Date("2026-08-01T10:00:00Z");
		mockGetNewestAlbumCreatedAt.mockResolvedValue(stamp);

		const api = createApi();
		const res = await api.request("/api/app/albums/newest", authedRequest(), env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { createdAt: string | null } };
		expect(body.data.createdAt).toBe("2026-08-01T10:00:00.000Z");
	});

	it("returns null createdAt when there are no albums", async () => {
		mockGetNewestAlbumCreatedAt.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request("/api/app/albums/newest", authedRequest(), env);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { createdAt: string | null } };
		expect(body.data.createdAt).toBeNull();
	});
});
