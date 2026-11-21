// SPDX-License-Identifier: AGPL-3.0-or-later
import { countCommentsByPosts } from "@/db/comments";
import { listPinnedPostIds } from "@/db/pinned-posts";
import { listPostFilesByPostIds } from "@/db/post-files/queries";
import type { PostFileEntry } from "@/db/post-files/schema";
import {
	getPostPollResults,
	listPaginatedPosts,
	listPostsByIds,
	type PostWithAuthorAndImages,
} from "@/db/posts";
import type { PostPollData } from "@/db/posts/schema";

export interface FeedCursor {
	createdAt: string;
	id: string;
}

/** Post z doklejonymi metadanymi renderu (#241) — kształt odpowiedzi feedu. */
export type FeedPostData = EnrichedPost & {
	pinned?: boolean;
};

/**
 * Post gotowy do renderu (#241): licznik komentarzy + ankieta z zagregowanymi
 * wynikami (payload + counts + głos widza). Kształt wspólny dla feedu i Biblioteki.
 */
export type EnrichedPost = Omit<PostWithAuthorAndImages, "poll"> & {
	commentCount: number;
	poll: PostPollData | null;
	/** Załączniki posta (#243) — dane do renderu wierszy i pobierania. */
	files: PostFileEntry[];
};

/**
 * Dokleja do postów metadane renderu w jednym batchu (no waterfall): licznik
 * komentarzy (#127) + wyniki ankiet (#241). Widz opcjonalny — bez sesji ankiety
 * pokazują same liczniki. Wideo nie wymaga doklejania — żyją w wierszu posta.
 */
export async function enrichPosts(
	posts: (PostWithAuthorAndImages & { pinned?: boolean })[],
	viewerId?: string | null,
): Promise<EnrichedPost[]> {
	if (posts.length === 0) return [];
	const postIds = posts.map((p) => p.id);
	const [commentCounts, pollResults, filesByPost] = await Promise.all([
		countCommentsByPosts(postIds),
		getPostPollResults(
			posts.map((p) => ({ postId: p.id, poll: p.poll })),
			viewerId ?? null,
		),
		listPostFilesByPostIds(postIds),
	]);
	return posts.map((p) => {
		const results = pollResults.get(p.id);
		return {
			...p,
			commentCount: commentCounts.get(p.id) ?? 0,
			files: filesByPost.get(p.id) ?? [],
			poll: p.poll
				? {
						question: p.poll.question,
						options: p.poll.options,
						counts: results?.counts ?? [],
						myVoteIndex: results?.myVoteIndex ?? null,
					}
				: null,
		};
	});
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
 * wykluczając przypięte z chronologii, z doklejonymi metadanymi renderu (#241).
 * Widz (opcjonalny) zasila „mój głos" w ankietach; bez sesji liczniki i tak widać.
 * Współdzielone między endpointem Hono a server function (SSR).
 */
export async function assembleFeedPage(input: {
	cursor?: FeedCursor;
	imageAccountHash: string;
	viewerId?: string | null;
}): Promise<FeedPageData> {
	const { cursor, imageAccountHash, viewerId } = input;

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

	const postsWithComments = await enrichPosts(allPosts, viewerId);

	return {
		data: postsWithComments,
		meta: { nextCursor: result.nextCursor, imageAccountHash },
	};
}
