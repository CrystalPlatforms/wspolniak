// SPDX-License-Identifier: AGPL-3.0-or-later

interface YouTubePlayerProps {
	youtubeVideoId: string;
	title?: string;
}

/**
 * Osadza odtwarzacz YouTube (iframe) dla danego `youtubeVideoId`.
 * Reużywane w szczegółach wideo oraz (po refaktorze) w success view uploadu.
 */
export function YouTubePlayer({ youtubeVideoId, title }: YouTubePlayerProps) {
	return (
		<div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
			<iframe
				className="h-full w-full"
				src={`https://www.youtube.com/embed/${youtubeVideoId}`}
				title={title ?? "Wideo"}
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
				allowFullScreen
			/>
		</div>
	);
}
