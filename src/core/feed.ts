// SPDX-License-Identifier: AGPL-3.0-or-later
import { countCommentsByPosts } from "@/db/comments";
import { listPinnedPostIds } from "@/db/pinned-posts";
import { listPaginatedPosts, listPostsByIds, type PostWithAuthorAndImages } from "@/db/posts";
import { listVideosByPostIds, type PostVideo } from "@/db/videos";

export interface FeedCursor {
	createdAt: string;
	id: string;
}

export type FeedPostData = PostWithAuthorAndImages & {
	commentCount: number;
	pinned?: boolean;
	videos: PostVideo[];
};

/** Post z doklejonymi metadanymi (licznik komentarzy + wideo) — kształt wspólny dla feedu i Biblioteki. */
export type EnrichedPost = PostWithAuthorAndImages & {
	commentCount: number;
	videos: PostVideo[];
};

/**
 * Dokleja do postów liczniki komentarzy i wideo w jednym batchu (no waterfall).
 * Współdzielone między feedem (`assembleFeedPage`) a Biblioteką, żeby PostCard
 * renderował się identycznie w obu miejscach (#127).
 */
export async function enrichPosts(
	posts: (PostWithAuthorAndImages & { pinned?: boolean })[],
): Promise<EnrichedPost[]> {
	if (posts.length === 0) return [];
	const postIds = posts.map((p) => p.id);
	const [commentCounts, videosByPost] = await Promise.all([
		countCommentsByPosts(postIds),
		listVideosByPostIds(postIds),
	]);
	return posts.map((p) => ({
		...p,
		commentCount: commentCounts.get(p.id) ?? 0,
		videos: videosByPost.get(p.id) ?? [],
	}));
}

export interface FeedPageData {
	data: FeedPostData[];
	meta: {
		nextCursor: FeedCursor | null;
		imageAccountHash: string;
	};
}

const FEED_PAGE_SIZE = 10;

/**
 * Składa jedną stronę feedu: przypięte posty (tylko na pierwszej stronie) + chronologia,
 * wykluczając przypięte z chronologii, z doklejonymi licznikami komentarzy.
 * Współdzielone między endpointem Hono a server function (SSR).
 */
export async function assembleFeedPage(input: {
	cursor?: FeedCursor;
	imageAccountHash: string;
}): Promise<FeedPageData> {
	const { cursor, imageAccountHash } = input;

	const pinnedIds = await listPinnedPostIds();
	const result = await listPaginatedPosts({
		limit: FEED_PAGE_SIZE,
		cursor,
		excludeIds: pinnedIds,
	});

	// Przypięte posty żyją tylko na pierwszej stronie (brak cursora), zawsze na górze.
	let pinned: PostWithAuthorAndImages[] = [];
	if (!cursor && pinnedIds.length > 0) {
		pinned = await listPostsByIds(pinnedIds);
	}

	const allPosts: (PostWithAuthorAndImages & { pinned?: boolean })[] = [
		...pinned.map((p) => ({ ...p, pinned: true })),
		...result.posts,
	];

	const postsWithComments = await enrichPosts(allPosts);

	return {
		data: postsWithComments,
		meta: { nextCursor: result.nextCursor, imageAccountHash },
	};
}

/**
 * Dokleja uporządkowaną listę wideo do pojedynczego posta (strona szczegółów).
 * Mirror batcha z `assembleFeedPage`, ale dla jednego posta.
 */
export async function withPostVideos(
	post: PostWithAuthorAndImages,
): Promise<PostWithAuthorAndImages & { videos: PostVideo[] }> {
	const map = await listVideosByPostIds([post.id]);
	return { ...post, videos: map.get(post.id) ?? [] };
}
