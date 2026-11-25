// SPDX-License-Identifier: AGPL-3.0-or-later
import { lazy, Suspense } from "react";
import type { VideoDialogData } from "./video-player-dialog";

/**
 * LazyVideoDialog — mount-on-open (#247): chunk (Radix Dialog + YoutubePostPlayer)
 * pobiera się dopiero przy pierwszym otwarciu. video=null → renderuje NIC,
 * więc karty bez otwartej pamięci o filmie nie pobierają chunku. Interfejs
 * 1:1 z VideoDialog — konsument zmienia tylko import.
 */

const VideoDialogLazy = lazy(() =>
	import("./video-player-dialog").then((m) => ({ default: m.VideoDialog })),
);

/** Czarna tarcza na czas pobrania chunku (fallback Suspense). */
function DialogLoading() {
	return (
		<div
			data-testid="video-dialog-loading"
			aria-live="polite"
			className="fixed inset-0 z-50 grid place-items-center bg-black/80"
		>
			<div className="skeleton size-16 rounded-lg" />
			<span className="sr-only">Ładowanie odtwarzacza</span>
		</div>
	);
}

export function LazyVideoDialog({
	video,
	onClose,
}: {
	video: VideoDialogData | null;
	onClose: () => void;
}) {
	if (video === null) return null;

	return (
		<Suspense fallback={<DialogLoading />}>
			<VideoDialogLazy video={video} onClose={onClose} />
		</Suspense>
	);
}
