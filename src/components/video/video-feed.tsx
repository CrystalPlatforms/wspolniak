// SPDX-License-Identifier: AGPL-3.0-or-later
import { RotateCcwIcon } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import type { VideoFeedItem } from "@/db/videos";
import { VideoCard, VideoCardSkeleton } from "./video-card";

/** Tyle szkieletów, ile wideo na stronie (VIDEO_PAGE_SIZE w core/functions/video-feed). */
const PENDING_SKELETONS = 12;

interface VideoFeedProps {
	videos: VideoFeedItem[];
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onLoadMore: () => void;
	/** Pierwsza strona danych jeszcze leci (#147) — szkielety zamiast mylącego „Brak wideo". */
	isPending?: boolean;
}

/**
 * Feed wideo: lista kart najnowsze-pierwsze + empty state + paginacja
 * przyciskiem "Załaduj więcej" (mirror `Feed` dla postów).
 */
export function VideoFeed({
	videos,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
	isPending = false,
}: VideoFeedProps) {
	if (isPending) {
		return (
			<div className="space-y-4" aria-busy="true">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{Array.from({ length: PENDING_SKELETONS }, (_, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: statyczna lista dekoracyjna o stałej długości
						<VideoCardSkeleton key={index} />
					))}
				</div>
			</div>
		);
	}

	if (videos.length === 0) {
		return (
			<div className="py-12 text-center">
				<p className="text-muted-foreground">Brak wideo</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{videos.map((video) => (
					<VideoCard key={video.id} video={video} />
				))}
			</div>

			<div>
				{isFetchingNextPage && (
					<div className="flex items-center justify-center py-4">
						<Loader loading size={6} />
					</div>
				)}
				{hasNextPage && !isFetchingNextPage && (
					<div className="flex justify-center py-4">
						<button
							type="button"
							onClick={onLoadMore}
							className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
						>
							<RotateCcwIcon className="h-4 w-4" />
							Załaduj więcej
						</button>
					</div>
				)}
				{!hasNextPage && videos.length > 0 && !isFetchingNextPage && (
					<p className="py-4 text-center text-muted-foreground">Koniec</p>
				)}
			</div>
		</div>
	);
}
