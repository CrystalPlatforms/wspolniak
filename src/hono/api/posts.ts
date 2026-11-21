// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { canDeletePost, canEditPost } from "@/core/authorization";
import { assembleFeedPage, enrichPosts } from "@/core/feed";
import { notifyMentions, notifyNewPost } from "@/core/notify";
import { purgePostFiles, syncPostFiles, verifyPostFileKeys } from "@/core/post-files";
import { buildPushDeps } from "@/core/push-deps";
import { deleteAlbumItemsByRefs } from "@/db/albums";
import { deleteBookmarksByPost } from "@/db/bookmarks";
import { createMentions, deleteMentionsByPost } from "@/db/mentions/queries";
import { listPinnedPostIds } from "@/db/pinned-posts";
import { attachPostFiles, getPostFile } from "@/db/post-files/queries";
import { voteOnPostPoll } from "@/db/posts/polls";
import {
	addPostImages,
	countUserPostsToday,
	createPost,
	deletePostImage,
	getPostById,
	reorderPostImages,
	softDeletePost,
	updatePost,
} from "@/db/posts/queries";
import { createPostSchema, updatePostSchema, votePostPollSchema } from "@/db/posts/schema";
import { fireAndForgetYoutubeDelete } from "@/hono/api/video";
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

	// Pliki (#243): klucze muszą istnieć w R2 (head) zanim post powstanie.
	const attachedFiles = result.data.files ?? [];
	if (attachedFiles.length > 0) {
		const verify = await verifyPostFileKeys(
			c.env.POST_FILES,
			attachedFiles.map((f) => f.key),
		);
		if (!verify.ok) {
			return c.json({ error: verify.error.message }, verify.error.status as ContentfulStatusCode);
		}
	}

	const post = await createPost({
		authorId: user.userId,
		description: result.data.description,
		cfImageIds: result.data.cfImageIds ?? [],
		videos: result.data.videos ?? [],
		poll: result.data.poll ?? null,
		location: result.data.location ?? null,
	});

	if (attachedFiles.length > 0) {
		await attachPostFiles(post.post.id, attachedFiles);
	}

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
	// #227: feed dokleja flagę `pinned` w assembleFeedPage — widok posta pobiera
	// pojedynczy rekord, więc tu musi sam oznaczyć przypięcie, inaczej menu
	// admina pokazuje „Przypnij post" także dla już przypiętych.
	const user = c.get("user");
	const [post, pinnedIds] = await Promise.all([
		getPostById(c.req.param("id")),
		listPinnedPostIds(),
	]);
	if (!post) {
		return c.json({ error: "Not found" }, 404);
	}
	// #241: ankieta wychodzi z zagregowanymi wynikami + głosem widza (liczba
	// liczy się serwerowo; tożsamości innych głosujących nigdy nie opuszczają API).
	const [enriched] = await enrichPosts([post], user.userId);
	return c.json({
		data: { ...enriched, pinned: pinnedIds.includes(enriched.id) },
		meta: { imageAccountHash: c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH },
	});
});

// GET /:id/files/:fileId (#243) — pobieranie załącznika: bucket prywatny, więc
// pliki wychodzą WYŁĄCZNIE tą autoryzowaną trasą (uwierzytelnieni członkowie
// dostają strumień z zachowanym typem MIME; anonimowi 401 z authMiddleware).
postsEndpoint.get("/:id/files/:fileId", async (c) => {
	const post = await getPostById(c.req.param("id"));
	if (!post) {
		return c.json({ error: "Not found" }, 404);
	}

	const file = await getPostFile(post.id, c.req.param("fileId"));
	if (!file) {
		return c.json({ error: "Not found" }, 404);
	}

	const object = await c.env.POST_FILES.get(file.key);
	if (!object) {
		return c.json({ error: "Plik nie istnieje w magazynie" }, 404);
	}

	return c.body(object.body, 200, {
		"content-type": object.httpMetadata?.contentType ?? file.mimeType,
		"content-length": String(object.size),
		"cache-control": "private, max-age=3600",
	});
});

// POST /:id/poll/vote (#241) — oddaj albo zmień głos (atomic upsert w domenie:
// jeden wiersz na głosującego). Zakres opcji waliduje domena wobec payloadu
// posta. Odpowiedź: same liczniki + głos wywołującego — tajność głosowania.
postsEndpoint.post("/:id/poll/vote", async (c) => {
	const user = c.get("user");
	const parsed = votePostPollSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
	}

	const result = await voteOnPostPoll(c.req.param("id"), user.userId, parsed.data.optionIndex);
	if (!result.ok) {
		return c.json({ error: result.error.message }, result.error.status as ContentfulStatusCode);
	}
	return c.json({ data: result.data });
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

	const { cfImageIds, imageOrder, videos } = result.data;

	// Pliki (#243): sync wg pełnej listy — zostawione zostają, nowe dochodzą
	// (weryfikacja head w R2), odebrane znikają z bazy i z storage od razu.
	if (result.data.files !== undefined) {
		const sync = await syncPostFiles(c.env.POST_FILES, post.id, result.data.files);
		if (!sync.ok) {
			return c.json({ error: sync.error.message }, sync.error.status as ContentfulStatusCode);
		}
	}

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

	const updated = await updatePost(post.id, {
		description: result.data.description,
		videos,
		location: result.data.location,
	});

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

	// Soft-delete posta + kaskadowe usunięcie jego zakładek u wszystkich userów (#131)
	// oraz elementów pożyczonych do albumów (#174). Niezależne operacje na różnych
	// tabelach → Promise.all (brak sekwencyjnych round-tripów).
	await Promise.all([
		softDeletePost(post.id),
		deleteBookmarksByPost(post.id),
		deleteAlbumItemsByRefs({
			kind: "post_photo",
			refs: post.images.map((image) => image.cfImageId),
		}),
	]);

	// Pliki (#243): usunięcie posta czyści wiersze i obiekty R2 natychmiast
	// (soft-delete bez ścieżki restore — decyzja PRD #240).
	await purgePostFiles(c.env.POST_FILES, post.id);

	// Kaskada YouTube (Video v2 F3 #197, us story 15): po jednym fire-and-forget
	// delete na wideo posta — błąd YouTube nigdy nie wywraca żądania (#197).
	for (const video of post.videos) {
		fireAndForgetYoutubeDelete(c.executionCtx, c.env, video.youtubeVideoId);
	}

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
	// Publiczny link udostępnienia pokazuje tekst + zdjęcia jak dotychczas —
	// ankieta/lokalizacja/pliki nie wychodzą bez sesji (prywatność rodziny).
	return c.json({
		data: { ...post, poll: undefined, location: undefined, files: undefined },
		meta: { imageAccountHash: c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH },
	});
});

export { publicPostsEndpoint };
export default postsEndpoint;
