// SPDX-License-Identifier: AGPL-3.0-or-later

import { enrichPosts } from "@/core/feed";
import {
	createBookmark,
	createBookmarkSchema,
	deleteBookmark,
	listBookmarksForUser,
} from "@/db/bookmarks";
import { getPostById, listPostsByIds } from "@/db/posts/queries";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";

const bookmarksEndpoint = createHono();

bookmarksEndpoint.use("*", authMiddleware());

// POST /bookmarks — zapisz posta do Biblioteki (idempotentny).
bookmarksEndpoint.post("/", async (c) => {
	const user = c.get("user");
	const parsed = createBookmarkSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
	}

	const post = await getPostById(parsed.data.postId);
	if (!post) {
		return c.json({ error: "Not found" }, 404);
	}

	await createBookmark({ userId: user.userId, postId: parsed.data.postId });
	return c.json({ data: { saved: true } }, 201);
});

// DELETE /bookmarks/:postId — usuń posta z Biblioteki (tylko własna zakładka).
bookmarksEndpoint.delete("/:postId", async (c) => {
	const user = c.get("user");
	const postId = c.req.param("postId");

	const deleted = await deleteBookmark(user.userId, postId);
	if (!deleted) {
		return c.json({ error: "Not found" }, 404);
	}
	return c.json({ data: { saved: false } });
});

// GET /bookmarks — zapisane posty usera, najnowsze pierwsze (pełny kształt jak w feedzie).
// meta.imageAccountHash pozwala Bibliotece budować URL-e zdjęć bez osobnego zapytania (#127).
bookmarksEndpoint.get("/", async (c) => {
	const user = c.get("user");
	const userBookmarks = await listBookmarksForUser(user.userId);
	const posts = await listPostsByIds(userBookmarks.map((b) => b.postId));
	const enriched = await enrichPosts(posts);
	return c.json({
		data: enriched,
		meta: { imageAccountHash: c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH },
	});
});

export default bookmarksEndpoint;
