// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconPlayerPlay } from "@tabler/icons-react";
import type { VideoDialogData } from "./video-player-dialog";

/**
 * Miniatura wideo (poster + ikona play) — klik otwiera LazyVideoDialog.
 * Mały moduł statyczny (lazy #247): miniatura wideo jest w głównym bundle
 * od razu, a ciężki player (Radix Dialog + YoutubePostPlayer) pobiera się
 * dopiero przy pierwszym otwarciu dialogu (mount-on-open).
 */

export function VideoPosterButton({
	video,
	onOpen,
}: {
	video: VideoDialogData;
	onOpen: (video: VideoDialogData) => void;
}) {
	return (
		<button
			type="button"
			aria-label={`Odtwórz wideo ${video.title}`}
			onClick={() => {
				onOpen(video);
			}}
			className="group relative block overflow-hidden rounded-lg border border-border bg-card transition-transform"
		>
			<img
				src={video.thumbnailUrl}
				alt={video.title}
				className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
				loading="lazy"
			/>
			<span className="absolute inset-0 flex items-center justify-center">
				<span className="flex size-12 items-center justify-center rounded-lg bg-black">
					<IconPlayerPlay className="size-5 fill-primary text-primary" aria-hidden="true" />
				</span>
			</span>
		</button>
	);
}
