// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from "@tanstack/react-router";
import type { VideoFeedItem } from "@/db/videos";

interface VideoCardProps {
	video: VideoFeedItem;
}

/**
 * Karta wideo w feedzie: miniatura + tytuł + autor + data.
 * Cała karta jest linkiem do strony szczegółów `/app/video/$id`.
 */
export function VideoCard({ video }: VideoCardProps) {
	const createdAt = new Date(video.createdAt);
	return (
		<Link
			to="/app/video/$id"
			params={{ id: video.id }}
			className="block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-accent"
		>
			<div className="aspect-video w-full overflow-hidden bg-muted">
				<img
					src={video.thumbnailUrl}
					alt={video.title}
					className="h-full w-full object-cover"
					loading="lazy"
				/>
			</div>
			<div className="space-y-1 p-3">
				<h3 className="line-clamp-2 font-semibold text-foreground">{video.title}</h3>
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<span>{video.author.name}</span>
					<span aria-hidden="true">·</span>
					<time dateTime={createdAt.toISOString()}>
						{createdAt.toLocaleDateString("pl-PL", {
							day: "numeric",
							month: "long",
							year: "numeric",
						})}
					</time>
				</div>
			</div>
		</Link>
	);
}
