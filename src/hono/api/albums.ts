// SPDX-License-Identifier: AGPL-3.0-or-later
import { downloadZip } from "client-zip";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { albumDownloadNames, buildAlbumVideosHtml } from "@/core/album-downloads";
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
	getNewestAlbumCreatedAt,
	listAddableAlbums,
	listAlbums,
	removeAlbumItem,
	renameAlbum,
	setAlbumCover,
	updateAlbumSchema,
} from "@/db/albums";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";
import { deleteCfImages, getImageUrl } from "@/images/client";

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

// GET /albums/newest — createdAt najnowszego albumu; kropka „new" przy pozycji
// nawigacji (#176). Zarejestrowane PRZED /:id — statyczny segment ma pierwszeństwo.
albumsEndpoint.get("/newest", async (c) => {
	const newest = await getNewestAlbumCreatedAt();
	return c.json({ data: { createdAt: newest?.toISOString() ?? null } });
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

// Content-Disposition z polskimi znakami w nazwie: fallback ASCII (zna-
// ki spoza 20–7E i cudzysłowy → „_") + RFC 5987 filename* (UTF-8).
function contentDispositionAttachment(filename: string): string {
	const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// GET /albums/:id/photos.zip — streaming ZIP zdjęć (#175): największy wariant
// JPEG („public") z Cloudflare Images, fetchowany LAZILY — zdjęcie leci z CF
// dopiero, gdy writer ZIP-a do niego dochodzi (stała pamięć w Workerze).
// client-zip pakuje metodą store: JPEG jest już skompresowany, CPU ≈ 0.
albumsEndpoint.get("/:id/photos.zip", async (c) => {
	const detail = await getAlbumById(c.req.param("id"));
	if (!detail) {
		return c.json({ error: "Not found" }, 404);
	}

	const photos = detail.items.filter((item) => item.kind !== "video");
	if (photos.length === 0) {
		return c.json({ error: "Ten album nie ma zdjęć do pobrania" }, 404);
	}

	const accountHash = c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
	async function* zipEntries() {
		for (const [index, photo] of photos.entries()) {
			const url = getImageUrl({ accountHash, cfImageId: photo.ref, variant: "public" });
			const res = await fetch(url);
			// Zdjęcie zniknęło z CF między odczytem a pobraniem → pomiń, nie psuj ZIP-a.
			if (!res.ok || !res.body) continue;
			yield { name: `zdjecie-${String(index + 1).padStart(3, "0")}.jpg`, input: res.body };
		}
	}

	const zip = downloadZip(zipEntries());
	return new Response(zip.body, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Disposition": contentDispositionAttachment(albumDownloadNames(detail.title).zip),
		},
	});
});

// GET /albums/:id/videos.html — plik HTML z linkami YouTube (#175). Wideo
// usunięte z biblioteki (video === null) pomijamy; pusty zbiór → 404
// (przycisk i tak jest wtedy schowany w UI).
albumsEndpoint.get("/:id/videos.html", async (c) => {
	const detail = await getAlbumById(c.req.param("id"));
	if (!detail) {
		return c.json({ error: "Not found" }, 404);
	}

	const videos = detail.items.flatMap((item) =>
		item.video ? [{ title: item.video.title, youtubeVideoId: item.video.youtubeVideoId }] : [],
	);
	if (videos.length === 0) {
		return c.json({ error: "Ten album nie ma wideo do pobrania" }, 404);
	}

	return new Response(buildAlbumVideosHtml(detail.title, videos), {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Content-Disposition": contentDispositionAttachment(
				albumDownloadNames(detail.title).videosHtml,
			),
		},
	});
});

export default albumsEndpoint;
