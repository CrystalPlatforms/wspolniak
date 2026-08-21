// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FadeImage } from "@/components/app/fade-image";
import { SkeletonLine } from "@/components/app/post-card-skeleton";
import { useBootSequence } from "@/core/boot-sequence";
import type { VideoFeedItem } from "@/db/videos";

/** Etapy choreografii karty wideo (#147) — kolejność jak w feedzie: tekst → media. */
export const VIDEO_CARD_STAGES = ["text", "media"] as const;
export type VideoCardStage = (typeof VIDEO_CARD_STAGES)[number];

interface VideoCardProps {
	video: VideoFeedItem;
}

/**
 * Karta wideo w feedzie: miniatura + tytuł + autor + data.
 * Cała karta jest linkiem do strony szczegółów `/app/video/$id`.
 * Od #147 stage'uje się jak PostCard w feedzie: zimny start pokazuje
 * szkielety, warm odsłania tekst od razu, a miniatura wygasa z FadeImage
 * po załadowaniu (etap media — finalny).
 */
export function VideoCard({ video }: VideoCardProps) {
	const [thumbLoaded, setThumbLoaded] = useState(false);
	const visible = useBootSequence<VideoCardStage>(VIDEO_CARD_STAGES, {
		text: true,
		media: thumbLoaded,
	});

	const createdAt = new Date(video.createdAt);
	return (
		<Link
			to="/app/video/$id"
			params={{ id: video.id }}
			className="block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-accent"
		>
			<div className="relative aspect-video w-full overflow-hidden bg-muted">
				<FadeImage
					src={video.thumbnailUrl}
					alt={video.title}
					className="h-full w-full object-cover"
					reveal={visible.media}
					onImageLoad={() => setThumbLoaded(true)}
				/>
			</div>
			<div className="space-y-1 p-3">
				{visible.text ? (
					<>
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
					</>
				) : (
					<div className="space-y-2" data-testid="skeleton-video-text" aria-hidden="true">
						<SkeletonLine className="w-full" />
						<SkeletonLine className="w-2/3" />
						<SkeletonLine className="w-40" />
					</div>
				)}
			</div>
		</Link>
	);
}

/** Szkielet karty wideo — lustro układu VideoCard (blok 16:9 + tytuł + meta). */
export function VideoCardSkeleton() {
	return (
		<div
			className="overflow-hidden rounded-lg border border-border bg-card"
			data-testid="video-card-skeleton"
			aria-hidden="true"
		>
			<div className="skeleton aspect-video w-full" />
			<div className="space-y-2 p-3">
				<SkeletonLine className="w-full" />
				<SkeletonLine className="w-2/3" />
				<SkeletonLine className="w-40" />
			</div>
		</div>
	);
}
