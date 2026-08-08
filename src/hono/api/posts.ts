// SPDX-License-Identifier: AGPL-3.0-or-later
import { canDeletePost, canEditPost } from "@/core/authorization";
import { assembleFeedPage, withPostVideos } from "@/core/feed";
import { notifyMentions, notifyNewPost } from "@/core/notify";
import { buildPushDeps } from "@/core/push-deps";
import { deleteBookmarksByPost } from "@/db/bookmarks";
import { createMentions, deleteMentionsByPost } from "@/db/mentions/queries";
import {
	addPostImages,
	countUserPostsToday,
	createPost,
	deletePostImage,
	getPostById,
	reorderPostImages,
	softDeletePost,
	updatePostDescription,
} from "@/db/posts/queries";
import { createPostSchema, updatePostSchema } from "@/db/posts/schema";
import { setPostVideos } from "@/db/videos";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";

const DAILY_POST_LIMIT = 50;

const postsEndpoint = createHono();

postsEndpoint.use("*", authMiddleware());

postsEndpoint.post("/", async (c) => {
	const user = c.get("user");
	const body = await c.req.json();
	const result = createPostSchema.safeParse(body);

	if (!result.success) {
		return c.json({ error: "Validation failed", details: result.error.flatten() }, 400);
	}

	const todayCount = await countUserPostsToday(user.userId);
	if (todayCount >= DAILY_POST_LIMIT) {
		return c.json({ error: "Osiągnięto dzienny limit postów (50)" }, 429);
	}

	const post = await createPost({
		authorId: user.userId,
		description: result.data.description,
		cfImageIds: result.data.cfImageIds ?? [],
	});

	await setPostVideos(post.post.id, result.data.videoIds ?? []);

	const mentionUserIds = result.data.mentions.map((m) => m.userId);
	if (mentionUserIds.length > 0) {
		await createMentions({ postId: post.post.id, commentId: null, userIds: mentionUserIds });
	}

	const pushDeps = buildPushDeps(c.env, post.post.id, "post");
	if (pushDeps) {
		c.executionCtx.waitUntil(notifyNewPost(pushDeps, user.userId, user.name, post.post.id));
		if (mentionUserIds.length > 0) {
			c.executionCtx.waitUntil(
				notifyMentions(pushDeps, user.userId, user.name, mentionUserIds, post.post.id),
			);
		}
	}

	return c.json({ data: post.post }, 201);
});

postsEndpoint.get("/", async (c) => {
	const cursorParam = c.req.query("cursor");
	let cursor: { createdAt: string; id: string } | undefined;
	if (cursorParam) {
		const separatorIndex = cursorParam.lastIndexOf("_");
		cursor = {
			createdAt: cursorParam.slice(0, separatorIndex),
			id: cursorParam.slice(separatorIndex + 1),
		};
	}

	const page = await assembleFeedPage({
		cursor,
		imageAccountHash: c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH,
	});

	return c.json(page);
});

postsEndpoint.get("/:id", async (c) => {
	const post = await getPostById(c.req.param("id"));
	if (!post) {
		return c.json({ error: "Not found" }, 404);
	}
	const postWithVideos = await withPostVideos(post);
	return c.json({
		data: postWithVideos,
		meta: { imageAccountHash: c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH },
	});
});

postsEndpoint.patch("/:id", async (c) => {
	const user = c.get("user");
	const body = await c.req.json();
	const result = updatePostSchema.safeParse(body);

	if (!result.success) {
		return c.json({ error: "Validation failed", details: result.error.flatten() }, 400);
	}

	const post = await getPostById(c.req.param("id"));
	if (!post) {
		return c.json({ error: "Not found" }, 404);
	}

	if (!canEditPost(user, post)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const { cfImageIds, imageOrder, videoIds } = result.data;

	if (imageOrder) {
		const knownIds = new Set(post.images.map((img) => img.id));
		const hasUnknown = imageOrder.some((id) => !knownIds.has(id));
		if (hasUnknown) {
			return c.json({ error: "imageOrder contains unknown image ids" }, 400);
		}
		await reorderPostImages(post.id, imageOrder);
	}

	if (cfImageIds && cfImageIds.length > 0) {
		await addPostImages(post.id, cfImageIds, post.images.length);
	}

	if (videoIds) {
		await setPostVideos(post.id, videoIds);
	}

	const updated = await updatePostDescription(post.id, result.data.description);

	const mentionUserIds = result.data.mentions.map((m) => m.userId);
	if (mentionUserIds.length > 0) {
		// Edycja opisu: replace mentions — usuń stare, stwórz nowe z aktualnej treści.
		await deleteMentionsByPost(post.id);
		await createMentions({ postId: post.id, commentId: null, userIds: mentionUserIds });
	}

	const pushDeps = buildPushDeps(c.env, post.id, "post");
	if (pushDeps && mentionUserIds.length > 0) {
		c.executionCtx.waitUntil(
			notifyMentions(pushDeps, user.userId, user.name, mentionUserIds, post.id),
		);
	}

	return c.json({ data: updated });
});

postsEndpoint.delete("/:id", async (c) => {
	const user = c.get("user");

	const post = await getPostById(c.req.param("id"));
	if (!post) {
		return c.json({ error: "Not found" }, 404);
	}

	if (!canDeletePost(user, post)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	// Soft-delete posta + kaskadowe usunięcie jego zakładek u wszystkich userów (#131).
	// Niezależne operacje na różnych tabelach → Promise.all (brak sekwencyjnych round-tripów).
	await Promise.all([softDeletePost(post.id), deleteBookmarksByPost(post.id)]);
	return c.json({ data: { id: post.id } });
});

postsEndpoint.delete("/:id/images/:imageId", async (c) => {
	const user = c.get("user");

	const post = await getPostById(c.req.param("id"));
	if (!post) {
		return c.json({ error: "Not found" }, 404);
	}

	if (!canEditPost(user, post)) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const deleted = await deletePostImage(post.id, c.req.param("imageId"));
	if (!deleted) {
		return c.json({ error: "Not found" }, 404);
	}

	return c.json({ data: { id: deleted.id } });
});

// Public endpoint for shared posts (no auth required)
const publicPostsEndpoint = createHono();

publicPostsEndpoint.get("/:id", async (c) => {
	const post = await getPostById(c.req.param("id"));
	if (!post) {
		return c.json({ error: "Not found" }, 404);
	}
	const postWithVideos = await withPostVideos(post);
	return c.json({
		data: postWithVideos,
		meta: { imageAccountHash: c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH },
	});
});

export { publicPostsEndpoint };
export default postsEndpoint;
