// SPDX-License-Identifier: AGPL-3.0-or-later
import { createAlbum, createAlbumSchema, getAlbumById, listAlbums } from "@/db/albums";
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

// GET /albums — kafelki newest-first (okładka + tytuł + licznik) + hash konta zdjęć.
albumsEndpoint.get("/", async (c) => {
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

export default albumsEndpoint;
