// SPDX-License-Identifier: AGPL-3.0-or-later
import { getVideoById } from "@/db/videos";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";

/**
 * Endpointy wideo montowane pod `/api/app/videos` (read, mirror `/api/app/posts`).
 * Oddzielone od `videoEndpoint` (OAuth/upload pod `/api/video`), aby uniknąć
 * konfliktu `GET /:id` ze statyczną trasą `GET /connection`.
 */
const videoAppEndpoint = createHono();

// Każda trasa wymaga zalogowanej sesji (członek rodziny).
videoAppEndpoint.use("*", authMiddleware());

// GET /api/app/videos/:id — pojedyncze wideo z autorem (strona szczegółów).
videoAppEndpoint.get("/:id", async (c) => {
	const video = await getVideoById(c.req.param("id"));
	if (!video) return c.json({ error: "Wideo nie zostało znalezione" }, 404);
	return c.json({ data: video });
});

export default videoAppEndpoint;
