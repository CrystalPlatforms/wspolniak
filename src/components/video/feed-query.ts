// SPDX-License-Identifier: AGPL-3.0-or-later
import { infiniteQueryOptions } from "@tanstack/react-query";
import { getVideoFeedPage } from "@/core/functions/video-feed";
import type { VideoFeedItem, VideoListCursor } from "@/db/videos";

/** Strona feedu wideo — `createdAt` to ISO string po serializacji RPC. */
export interface VideoFeedPage {
	data: VideoFeedItem[];
	meta: { nextCursor: VideoListCursor | null };
}

/** Klucz infinite query feedu wideo w cache TanStack Query. */
export const videoFeedQueryKey = ["videos"] as const;

type VideoCursor = NonNullable<VideoFeedPage["meta"]["nextCursor"]>;

/**
 * Wspólne opcje infinite query feedu wideo — używane przez SSR loader
 * (preload pierwszej strony) oraz przez komponent (odczyt z cache + fetchNextPage).
 */
export const videoFeedOptions = infiniteQueryOptions({
	queryKey: videoFeedQueryKey,
	queryFn: ({ pageParam }: { pageParam: VideoCursor | undefined }) =>
		getVideoFeedPage({ data: { cursor: pageParam } }).then(
			(page) => page as unknown as VideoFeedPage,
		),
	initialPageParam: undefined as VideoCursor | undefined,
	getNextPageParam: (lastPage: VideoFeedPage) => lastPage.meta.nextCursor ?? undefined,
});
