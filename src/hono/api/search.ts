// SPDX-License-Identifier: AGPL-3.0-or-later
import { searchAlbums } from "@/db/albums";
import { searchComments } from "@/db/comments";
import { searchPosts } from "@/db/posts";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";

const SEARCH_LIMIT_PER_GROUP = 12;

const searchEndpoint = createHono();

searchEndpoint.use("*", authMiddleware());

searchEndpoint.get("/", async (c) => {
	const q = (c.req.query("q") ?? "").trim();
	if (!q || q.length > 200) {
		return c.json({ error: "Podaj frazę do wyszukania" }, 400);
	}

	const [posts, comments, albums] = await Promise.all([
		searchPosts(q, SEARCH_LIMIT_PER_GROUP),
		searchComments(q, SEARCH_LIMIT_PER_GROUP),
		searchAlbums(q, SEARCH_LIMIT_PER_GROUP),
	]);
	return c.json({
		data: { posts, comments, albums },
		meta: { imageAccountHash: c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH },
	});
});

export default searchEndpoint;
