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

	const postIds = allPosts.map((p) => p.id);
	// Batch równolegle: liczniki komentarzy + wideo przypięte do postów (no waterfall).
	const [commentCounts, videosByPost] = await Promise.all([
		countCommentsByPosts(postIds),
		listVideosByPostIds(postIds),
	]);
	const postsWithComments = allPosts.map((p) => ({
		...p,
		commentCount: commentCounts.get(p.id) ?? 0,
		videos: videosByPost.get(p.id) ?? [],
	}));

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
