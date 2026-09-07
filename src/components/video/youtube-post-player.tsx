// SPDX-License-Identifier: AGPL-3.0-or-later
import { Maximize, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimalny własny player na YouTube IFrame Player API (Video v2 F4 #198,
 * us stories 16–22): klik na powierzchni przełącza play/pause, pasek postępu
 * pokazuje pozycję i przewija, przycisk pełnego ekranu robi fullscreen na
 * wrapperze. Na `ended` player przewija do ostatniej klatki i pauzuje (zamrożona
 * klatka, zero ekranów końcowych YT) i pokazuje „Odtwórz ponownie". Related
 * videos wyłączone na poziomie embeda (`rel: 0`); watermark YT zostaje widoczny
 * (przezroczysty overlay nie zasłania powierzchni iframe). Wolumin celowo brak.
 */

interface YTPlayer {
	playVideo: () => void;
	pauseVideo: () => void;
	seekTo: (seconds: number, allowSeekAhead: boolean) => void;
	getCurrentTime: () => number;
	getDuration: () => number;
	getPlayerState: () => number;
	destroy: () => void;
}

interface YTNamespace {
	Player: new (
		element: HTMLElement,
		options: {
			videoId: string;
			playerVars?: Record<string, string | number>;
			events?: {
				onReady?: () => void;
				onStateChange?: (event: { data: number }) => void;
			};
		},
	) => YTPlayer;
}

declare global {
	interface Window {
		YT?: YTNamespace;
		onYouTubeIframeAPIReady?: () => void;
	}
}

// Stany playera YT (IKF API): -1 niezaładowany, 0 ended, 1 playing, 2 paused.
const YT_STATE_ENDED = 0;
const YT_STATE_PLAYING = 1;

let ytApiPromise: Promise<YTNamespace> | null = null;

/** Leniwie ładuje IFrame API (raz na aplikację); poster czeka do pierwszego kliku. */
function loadYtApi(): Promise<YTNamespace> {
	if (typeof window === "undefined") return Promise.reject(new Error("no window (SSR)"));
	if (window.YT?.Player) return Promise.resolve(window.YT);
	if (!ytApiPromise) {
		ytApiPromise = new Promise<YTNamespace>((resolve) => {
			const previous = window.onYouTubeIframeAPIReady;
			window.onYouTubeIframeAPIReady = () => {
				previous?.();
				resolve(window.YT as YTNamespace);
			};
			const tag = document.createElement("script");
			tag.src = "https://www.youtube.com/iframe_api";
			document.head.appendChild(tag);
		});
	}
	return ytApiPromise;
}

interface YoutubePostPlayerProps {
	youtubeVideoId: string;
	title: string;
	thumbnailUrl: string;
}

export function YoutubePostPlayer({ youtubeVideoId, title, thumbnailUrl }: YoutubePostPlayerProps) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const mountRef = useRef<HTMLDivElement>(null);
	const playerRef = useRef<YTPlayer | null>(null);
	const [started, setStarted] = useState(false);
	const [playing, setPlaying] = useState(false);
	const [ended, setEnded] = useState(false);
	const [progress, setProgress] = useState(0);
	const [duration, setDuration] = useState(0);
	const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

	const stopProgressTimer = useCallback(() => {
		if (progressTimer.current) {
			clearInterval(progressTimer.current);
			progressTimer.current = null;
		}
	}, []);

	const startProgressTimer = useCallback(() => {
		stopProgressTimer();
		progressTimer.current = setInterval(() => {
			const player = playerRef.current;
			if (!player) return;
			const current = player.getCurrentTime() || 0;
			const total = player.getDuration() || 0;
			setDuration(total);
			setProgress(total > 0 ? Math.min(100, (current / total) * 100) : 0);
		}, 250);
	}, [stopProgressTimer]);

	useEffect(
		() => () => {
			stopProgressTimer();
			playerRef.current?.destroy();
			playerRef.current = null;
		},
		[stopProgressTimer],
	);

	const startPlayback = useCallback(async () => {
		if (started) return;
		setStarted(true);
		const YT = await loadYtApi();
		if (!mountRef.current) return;
		playerRef.current = new YT.Player(mountRef.current, {
			videoId: youtubeVideoId,
			playerVars: {
				// rel: 0 — related videos wyłączone na poziomie embeda (#198);
				// controls: 0 — chrome playera to nasz minimalny pasek pod spodem.
				rel: 0,
				controls: 0,
				playsinline: 1,
				disablekb: 1,
			},
			events: {
				onReady: () => {
					playerRef.current?.playVideo();
					startProgressTimer();
				},
				onStateChange: (event) => {
					if (event.data === YT_STATE_PLAYING) {
						setPlaying(true);
						startProgressTimer();
					} else {
						setPlaying(false);
					}
					if (event.data === YT_STATE_ENDED) {
						// Zamrożenie ostatniej klatki zamiast ekranu końcowego YT (#198):
						// sekunda przed końcem + pauza, potem „Odtwórz ponownie".
						const player = playerRef.current;
						const total = player?.getDuration() || 0;
						player?.seekTo(Math.max(0, total - 0.05), true);
						player?.pauseVideo();
						setEnded(true);
						stopProgressTimer();
					}
				},
			},
		});
	}, [started, youtubeVideoId, startProgressTimer, stopProgressTimer]);

	const togglePlay = useCallback(() => {
		const player = playerRef.current;
		if (!player || ended) return;
		if (player.getPlayerState() === YT_STATE_PLAYING) {
			player.pauseVideo();
		} else {
			player.playVideo();
		}
	}, [ended]);

	const replay = useCallback(() => {
		const player = playerRef.current;
		if (!player) return;
		setEnded(false);
		player.seekTo(0, true);
		player.playVideo();
	}, []);

	const seekFromBar = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			const player = playerRef.current;
			const bar = event.currentTarget;
			if (!player || duration <= 0) return;
			const rect = bar.getBoundingClientRect();
			const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
			player.seekTo(fraction * duration, true);
			setProgress(fraction * 100);
		},
		[duration],
	);

	/** Dostępność paska (a11y): strzałki ←/→ przewijają o 5% klipu. */
	const seekByKeyboard = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			const player = playerRef.current;
			if (!player || duration <= 0) return;
			if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
			const delta = event.key === "ArrowRight" ? 5 : -5;
			const next = Math.min(100, Math.max(0, progress + delta));
			event.preventDefault();
			player.seekTo((next / 100) * duration, true);
			setProgress(next);
		},
		[duration, progress],
	);

	const requestFullscreen = useCallback(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		const anyWrapper = wrapper as HTMLElement & {
			webkitRequestFullscreen?: () => void;
		};
		if (wrapper.requestFullscreen) {
			void wrapper.requestFullscreen();
		} else if (anyWrapper.webkitRequestFullscreen) {
			anyWrapper.webkitRequestFullscreen();
		}
	}, []);

	return (
		<div className="overflow-hidden rounded-lg border border-border bg-card">
			<div ref={wrapperRef} className="relative aspect-video w-full bg-black">
				{/* Miejsce na iframe (YT API podmienia ten element przy starcie). */}
				{started ? <div ref={mountRef} className="absolute inset-0 h-full w-full" /> : null}

				{!started ? (
					<button
						type="button"
						aria-label={`Odtwórz wideo ${title}`}
						onClick={() => {
							void startPlayback();
						}}
						className="absolute inset-0 block h-full w-full"
					>
						<img
							src={thumbnailUrl}
							alt={title}
							className="h-full w-full object-cover"
							loading="lazy"
						/>
						<span className="absolute inset-0 flex items-center justify-center">
							<span className="flex size-12 items-center justify-center rounded-lg bg-black">
								<Play className="size-5 fill-primary text-primary" />
							</span>
						</span>
					</button>
				) : (
					<>
						{/* Przezroczysty overlay klikalny — watermark YT pod spodem zostaje widoczny. */}
						<button
							type="button"
							aria-label={playing ? "Pauza" : "Odtwórz"}
							onClick={togglePlay}
							className="absolute inset-0 h-full w-full"
						/>
						{ended ? (
							<span className="absolute inset-0 flex items-center justify-center">
								<button
									type="button"
									onClick={replay}
									className="flex items-center gap-2 rounded-full bg-black/90 px-5 py-3 text-sm font-bold text-white"
								>
									<Play className="size-4 fill-primary text-primary" />
									Odtwórz ponownie
								</button>
							</span>
						) : null}
					</>
				)}
			</div>

			{/* Nasz minimalny pasek: postęp + seek + fullscreen — pod wideo, watermark nietknięty. */}
			<div className="flex items-center gap-2 p-2">
				<div
					role="slider"
					aria-label="Postęp wideo"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(progress)}
					onClick={seekFromBar}
					onKeyDown={seekByKeyboard}
					tabIndex={0}
					className="h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-muted"
				>
					<div
						className="h-full rounded-full bg-primary transition-[width] duration-200"
						style={{ width: `${progress}%` }}
					/>
				</div>
				<button
					type="button"
					aria-label="Pełny ekran"
					onClick={requestFullscreen}
					className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<Maximize className="size-4" />
				</button>
			</div>
		</div>
	);
}
