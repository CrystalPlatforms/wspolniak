// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { canManageAlbum } from "@/core/authorization";
import { AppError } from "@/core/errors";
import type { AlbumItem } from "@/db/albums";
import {
	addAlbumItems,
	addAlbumItemsSchema,
	createAlbum,
	createAlbumSchema,
	deleteAlbum,
	getAlbumById,
	listAddableAlbums,
	listAlbums,
	removeAlbumItem,
	renameAlbum,
	setAlbumCover,
	updateAlbumSchema,
} from "@/db/albums";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";
import { deleteCfImages } from "@/images/client";

const albumsEndpoint = createHono();

albumsEndpoint.use("*", authMiddleware());

// POST /albums — tytuł + ≥1 własne zdjęcie (cfImageId po uploadzie po stronie klienta).
albumsEndpoint.post("/", async (c) => {
	const user = c.get("user");
	const parsed = createAlbumSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
	}

	const { album, items } = await createAlbum({
		creatorId: user.userId,
		title: parsed.data.title,
		photoIds: parsed.data.photoIds,
	});

	return c.json(
		{
			data: {
				id: album.id,
				title: album.title,
				creatorId: album.creatorId,
				createdAt: album.createdAt,
				photoCount: items.length,
			},
		},
		201,
	);
});

// GET /albums?addable=1 — albumy do wyboru w dialogu „Dodaj do albumu" (sesja):
// członek dostaje własne, admin wszystkie. Bez parametru → pełna lista.
albumsEndpoint.get("/", async (c) => {
	if (c.req.query("addable") === "1") {
		const user = c.get("user");
		const albums = await listAddableAlbums({
			userId: user.userId,
			isAdmin: user.role === "admin",
		});
		return c.json({ data: albums });
	}

	const tiles = await listAlbums();
	return c.json({
		data: tiles,
		meta: { imageAccountHash: c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH },
	});
});

// GET /albums/:id — szczegóły albumu + elementy w kolejności dodawania.
albumsEndpoint.get("/:id", async (c) => {
	const detail = await getAlbumById(c.req.param("id"));
	if (!detail) {
		return c.json({ error: "Not found" }, 404);
	}
	return c.json({
		data: detail,
		meta: { imageAccountHash: c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH },
	});
});

// POST /albums/:id/items — dokłada elementy do albumu (#171): pożyczone zdjęcia
// z postów (post_photo), wideo (#172, video) albo własne zdjęcia (own_image,
// akcja „Dodaj zdjęcia"). Duplikat (album, kind, ref) — cichy no-op (unique idx).
// Mutacja: tylko twórca albumu albo admin (pełna matryca uprawnień — F4).
albumsEndpoint.post("/:id/items", async (c) => {
	const user = c.get("user");
	const albumId = c.req.param("id");

	const detail = await getAlbumById(albumId);
	if (!detail) {
		return c.json({ error: "Not found" }, 404);
	}
	if (detail.creatorId !== user.userId && user.role !== "admin") {
		return c.json({ error: "Forbidden" }, 403);
	}

	const parsed = addAlbumItemsSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
	}

	let added: AlbumItem[];
	try {
		added = await addAlbumItems({
			albumId,
			kind: parsed.data.kind,
			refs: parsed.data.refs,
		});
	} catch (e) {
		if (e instanceof AppError)
			return c.json({ error: e.message }, e.status as ContentfulStatusCode);
		throw e;
	}

	return c.json({ data: { added: added.length } }, 201);
});

// PATCH /albums/:id — zmiana nazwy i/lub ręcznej okładki (#173). Mutacja dla
// twórcy albo admina. Okładka musi wskazywać ZDJĘCIE z TEGO albumu (wideo i
// elementy cudzych albumów → 400); walidacja na warstwie API, zapis w domenie.
albumsEndpoint.patch("/:id", async (c) => {
	const user = c.get("user");
	const albumId = c.req.param("id");

	const detail = await getAlbumById(albumId);
	if (!detail) {
		return c.json({ error: "Not found" }, 404);
	}
	if (!canManageAlbum(user, detail)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const parsed = updateAlbumSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
	}

	const { title, coverItemId } = parsed.data;

	if (coverItemId !== undefined) {
		const coverItem = detail.items.find((item) => item.id === coverItemId);
		if (!coverItem || coverItem.kind === "video") {
			return c.json({ error: "Okładka musi być zdjęciem z tego albumu" }, 400);
		}
	}

	if (title !== undefined) {
		await renameAlbum(albumId, title);
	}
	if (coverItemId !== undefined) {
		await setAlbumCover(albumId, coverItemId);
	}

	const refreshed = await getAlbumById(albumId);

	return c.json({ data: { id: albumId, title: refreshed?.title ?? detail.title } });
});

// DELETE /albums/:id — usuwa album (#173). Zdjęcia WŁASNE (own_image) są
// kasowane z Cloudflare Images (wzorzec z video.ts: zasób zewnętrzny PRZED
// bazą, żeby awaria CF nie zostawiała leaku); pożyczone elementy (post_photo,
// video) NIE są ruszane — feed bezpieczny. Response zawiera listę usuniętych
// cfImageId (weryfikacja HITL w dashboardzie CF).
albumsEndpoint.delete("/:id", async (c) => {
	const user = c.get("user");
	const albumId = c.req.param("id");

	const detail = await getAlbumById(albumId);
	if (!detail) {
		return c.json({ error: "Not found" }, 404);
	}
	if (!canManageAlbum(user, detail)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	// Zdjęcia własne do czyszczenia z CF — refy zbieramy z już pobranych elementów.
	const ownImageIds = detail.items
		.filter((item) => item.kind === "own_image")
		.map((item) => item.ref);

	await deleteCfImages(
		{ accountId: c.env.CLOUDFLARE_ACCOUNT_ID, apiToken: c.env.CLOUDFLARE_IMAGES_API_TOKEN },
		ownImageIds,
	);

	const deletedImageIds = (await deleteAlbum(albumId)) ?? [];

	return c.json({ data: { id: albumId, deletedImageIds } });
});

// DELETE /albums/:id/items/:itemId — wyciąga element z albumu (#173) bez
// dotykania źródła: post z tym zdjęciem działa dalej, wideo zostaje
// w bibliotece. Tylko twórca albo admin (matryca uprawnień F4).
albumsEndpoint.delete("/:id/items/:itemId", async (c) => {
	const user = c.get("user");
	const albumId = c.req.param("id");

	const detail = await getAlbumById(albumId);
	if (!detail) {
		return c.json({ error: "Not found" }, 404);
	}
	if (!canManageAlbum(user, detail)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const removed = await removeAlbumItem(albumId, c.req.param("itemId"));
	if (!removed) {
		return c.json({ error: "Not found" }, 404);
	}

	return c.json({ data: { id: removed.id } });
});

export default albumsEndpoint;
