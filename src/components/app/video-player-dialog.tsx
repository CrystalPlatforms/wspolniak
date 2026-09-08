// SPDX-License-Identifier: AGPL-3.0-or-later
import { Play } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { YoutubePostPlayer } from "@/components/video/youtube-post-player";

export interface VideoDialogData {
	youtubeVideoId: string;
	title: string;
	thumbnailUrl: string;
}

/**
 * Miniatura wideo (poster + ikona play) — klik otwiera `VideoDialog`.
 * Wspólna dla karty na feedzie i widoku posta (Video v2 F4 #198).
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
					<Play className="size-5 fill-primary text-primary" />
				</span>
			</span>
		</button>
	);
}

/**
 * Dialog z playerem (reviza usera: wideo odtwarza się w oknie, nie inline).
 * Zamknięcie dialogu odmontowuje playera (koniec odtwarzania).
 *
 * Pełny ekran: DIALOG sam rozszerza się na cały ekran (inline style nadpisuje
 * transform centrujący Radixa — `fixed` w środku transformowanego przodka
 * pozycjonowałoby się względem dialogu, nie ekranu). ESC w trybie pełnoekranowym
 * najpierw zwija player (onEscapeKeyDown preventDefault), nie zamyka okna.
 */
export function VideoDialog({
	video,
	onClose,
}: {
	video: VideoDialogData | null;
	onClose: () => void;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<Dialog
			open={video !== null}
			onOpenChange={(open) => {
				if (!open) {
					setExpanded(false);
					onClose();
				}
			}}
		>
			<DialogContent
				aria-describedby={undefined}
				className={
					expanded
						? // Pełny ekran: chowamy wbudowany krzyżyk Radixa — zostaje JEDEN X (nasz).
							"overflow-hidden border-0 bg-black p-0 [&>button]:hidden"
						: "max-w-[min(calc(100vw-2rem),960px)] border-0 bg-black p-1.5 [&>button]:text-white"
				}
				style={
					expanded
						? {
								position: "fixed",
								inset: 0,
								// Tailwind v4 centruje dialog właściwością `translate` (nie
								// `transform`) — bez tego dialog zostaje przesunięty o -50%.
								transform: "none",
								translate: "none",
								maxWidth: "none",
								width: "100%",
								height: "100%",
								borderRadius: 0,
								// Safe-area iPhone'a (notch/pasek) — nic nie wychodzi za kadr.
								padding:
									"calc(0.5rem + env(safe-area-inset-top)) calc(0.5rem + env(safe-area-inset-right)) calc(0.5rem + env(safe-area-inset-bottom)) calc(0.5rem + env(safe-area-inset-left))",
							}
						: undefined
				}
				onEscapeKeyDown={(event) => {
					// ESC najpierw zwija pełny ekran — dopiero kolejne zamyka dialog.
					if (expanded) event.preventDefault();
				}}
			>
				<DialogHeader className="sr-only">
					<DialogTitle>{video?.title}</DialogTitle>
				</DialogHeader>
				{video && (
					<YoutubePostPlayer
						youtubeVideoId={video.youtubeVideoId}
						title={video.title}
						thumbnailUrl={video.thumbnailUrl}
						expanded={expanded}
						onExpandedChange={setExpanded}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
