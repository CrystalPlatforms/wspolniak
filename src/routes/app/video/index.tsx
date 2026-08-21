// SPDX-License-Identifier: AGPL-3.0-or-later
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { PullToRefresh } from "@/components/app/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { videoFeedOptions } from "@/components/video/feed-query";
import { VideoFeed } from "@/components/video/video-feed";

export const Route = createFileRoute("/app/video/")({
	// SSR preload: pierwsza strona feedu trafia do cache przed renderem HTML.
	loader: async ({ context }) => {
		await context.queryClient.ensureInfiniteQueryData(videoFeedOptions);
	},
	component: VideoFeedScreen,
});

function VideoFeedScreen() {
	const { data, hasNextPage, isFetchingNextPage, fetchNextPage, refetch, isPending } =
		useInfiniteQuery(videoFeedOptions);

	const allVideos = data?.pages.flatMap((page) => page.data) ?? [];

	return (
		<PullToRefresh
			onRefresh={async () => {
				await refetch();
			}}
		>
			<div className="max-w-4xl bg-background px-4 py-6 pb-28 sm:pb-6">
				<div className="mb-6 flex items-center gap-2">
					<h1 className="text-2xl font-bold text-foreground">Wideo</h1>
					<div className="flex-1" />
					<Link to="/app/new-video">
						<Button variant="ghost" size="lg" title="Dodaj wideo">
							<Plus className="h-4 w-4" />
						</Button>
					</Link>
				</div>
				<VideoFeed
					videos={allVideos as never[]}
					hasNextPage={hasNextPage}
					isFetchingNextPage={isFetchingNextPage}
					onLoadMore={() => fetchNextPage()}
					isPending={isPending}
				/>
			</div>
		</PullToRefresh>
	);
}
