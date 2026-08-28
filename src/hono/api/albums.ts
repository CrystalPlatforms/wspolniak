// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	addAlbumItems,
	addAlbumItemsSchema,
	createAlbum,
	createAlbumSchema,
	getAlbumById,
	listAddableAlbums,
	listAlbums,
} from "@/db/albums";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";

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

	const added = await addAlbumItems({
		albumId,
		kind: parsed.data.kind,
		refs: parsed.data.refs,
	});

	return c.json({ data: { added: added.length } }, 201);
});

export default albumsEndpoint;
