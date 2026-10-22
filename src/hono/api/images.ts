// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";
import { createDirectUploadUrl, createDirectUploadUrlBatch, getImageUrl } from "@/images/client";
import { batchUploadUrlSchema } from "@/images/schema";
import { contentDispositionAttachment } from "@/lib/content-disposition";

const imagesEndpoint = createHono();

imagesEndpoint.use("*", authMiddleware());

imagesEndpoint.post("/upload-url", async (c) => {
	const result = await createDirectUploadUrl({
		accountId: c.env.CLOUDFLARE_ACCOUNT_ID,
		apiToken: c.env.CLOUDFLARE_IMAGES_API_TOKEN,
	});

	return c.json({ data: result });
});

// Batch (issue #95): jeden request zwraca N par {cfImageId, uploadURL} zamiast N round-tripów.
imagesEndpoint.post("/upload-urls", async (c) => {
	const parsed = batchUploadUrlSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Invalid count" }, 400);
	}

	const data = await createDirectUploadUrlBatch(
		{
			accountId: c.env.CLOUDFLARE_ACCOUNT_ID,
			apiToken: c.env.CLOUDFLARE_IMAGES_API_TOKEN,
		},
		parsed.data.count,
	);

	return c.json({ data });
});

// GET /:cfImageId/download — pobieranie pojedynczego zdjęcia (#225): proxy z
// imagedelivery.net z nagłówkiem attachment (nagłówków dostawczych Cloudflare
// Images nie da się nadpisać). Po sesji — prywatne zdjęcia rodzinne. WebView
// wrappera łapie to przez DownloadListener; przeglądarka dostaje plik normalnie
// dzięki attachment.
imagesEndpoint.get("/:cfImageId/download", async (c) => {
	const cfImageId = c.req.param("cfImageId");
	const upstream = await fetch(
		getImageUrl({
			accountHash: c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH,
			cfImageId,
			variant: "public",
		}),
	);
	if (!upstream.ok || !upstream.body) {
		return c.json({ error: "Image not found" }, upstream.status === 404 ? 404 : 502);
	}

	const headers = new Headers();
	headers.set(
		"Content-Disposition",
		contentDispositionAttachment(c.req.query("name") ?? `wspolniak-${cfImageId}.jpg`),
	);
	const type = upstream.headers.get("content-type");
	if (type) headers.set("Content-Type", type);
	const length = upstream.headers.get("content-length");
	if (length) headers.set("Content-Length", length);
	return new Response(upstream.body, { status: 200, headers });
});

export default imagesEndpoint;
