// SPDX-License-Identifier: AGPL-3.0-or-later
import { Maximize, Minimize, Play, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Minimalny własny player na YouTube IFrame Player API (Video v2 F4 #198,
 * us stories 16–22): klik na powierzchni przełącza play/pause, pasek postępu
 * pokazuje pozycję i przewija (klik + strzałki), pełny ekran to WŁASNY tryb
 * CSS (działa też na iOS, gdzie iframe nie wspiera requestFullscreen) z
 * przyciskiem zamknięcia i ESC. Na `ended` player przewija do ostatniej
 * klatki i pauzuje (zamrożona klatka, zero ekranów końcowych YT) i pokazuje
 * „Odtwórz ponownie". Related videos wyłączone na poziomie embeda (`rel: 0`);
 * iframe ma zablokowane zdarzenia wskaźnika, więc paski YouTube (udostępnij/
 * ustawienia) się nie pokazują — graficzny watermark YT zostaje widoczny.
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
	/** Tryb pełnoekranowy sterowany z zewnątrz — dialog rozszerza się na ekran. */
	expanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
}

export function YoutubePostPlayer({
	youtubeVideoId,
	title,
	thumbnailUrl,
	expanded = false,
	onExpandedChange,
}: YoutubePostPlayerProps) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const mountRef = useRef<HTMLDivElement>(null);
	const playerRef = useRef<YTPlayer | null>(null);
	const [started, setStarted] = useState(false);
	const [playing, setPlaying] = useState(false);
	const [ended, setEnded] = useState(false);
	const [progress, setProgress] = useState(0);
	const [duration, setDuration] = useState(0);
	const setExpanded = useCallback(
		(next: boolean) => {
			onExpandedChange?.(next);
		},
		[onExpandedChange],
	);
	// Systemowy fullscreen (Android, iOS 16.4+, desktop) — UA sam obsługuje wejście/wyjście.
	const [nativeFs, setNativeFs] = useState(false);
	// Stary iPhone (iOS bez Fullscreen API): apple'owy fullscreen jest osiągalny
	// WYŁĄCZNIE przyciskiem wbudowanego playera YouTube (on gra w <video>) —
	// więc tam włączamy jego kontrolki. Desktop/Android/reszta iOS: controls=0.
	const isAppleMobileWithoutFs =
		typeof navigator !== "undefined" &&
		/iPad|iPhone|iPod/.test(navigator.userAgent) &&
		!(typeof Element !== "undefined" && "requestFullscreen" in Element.prototype);
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
			// Zamrożenie PRZED fizycznym końcem (reviza: seek 0.05s przed końcem
			// wypadał poza materiałem i YT pokazywał losową klatkę). Zatrzymanie
			// ~0.3s przed końcem nie dopuszcza do ekranu końcowego YT wcale.
			if (total > 0 && current >= total - 0.3) {
				player.seekTo(Math.max(0, total - 0.3), true);
				player.pauseVideo();
				setEnded(true);
				stopProgressTimer();
				return;
			}
			setProgress(total > 0 ? Math.min(100, (current / total) * 100) : 0);
		}, 200);
	}, [stopProgressTimer]);

	useEffect(() => {
		return () => {
			stopProgressTimer();
			playerRef.current?.destroy();
			playerRef.current = null;
		};
	}, [stopProgressTimer]);

	// Własny pełny ekran (CSS): blokada scrolla strony + zamykanie ESC.
	useEffect(() => {
		if (!expanded) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setExpanded(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			document.body.style.overflow = previousOverflow;
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [expanded, setExpanded]);

	// Systemowy fullscreen (Android, iOS 16.4+, desktop) — synchronizacja z gestami UA.
	useEffect(() => {
		const sync = () => setNativeFs(document.fullscreenElement === wrapperRef.current);
		document.addEventListener("fullscreenchange", sync);
		return () => document.removeEventListener("fullscreenchange", sync);
	}, []);

	/**
	 * Wejście: systemowy fullscreen gdy urządzenie go ma (Android, iOS 16.4+,
	 * desktop). Gdy nie ma (starszy iPhone Safari) — pełnoekranowy tryb w dialogu
	 * (iOS pozwala natywny fullscreen wyłącznie elementom <video>, a YouTube gra
	 * w cross-origin iframe). Wyjście z systemowego fullscreen zawsze działa.
	 */
	const toggleFullscreen = useCallback(() => {
		if (document.fullscreenElement) {
			void document.exitFullscreen();
			return;
		}
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		const webkitWrapper = wrapper as HTMLElement & { webkitRequestFullscreen?: () => void };
		const request =
			wrapper.requestFullscreen?.bind(wrapper) ??
			webkitWrapper.webkitRequestFullscreen?.bind(webkitWrapper);
		if (request) {
			request().catch(() => setExpanded(true));
		} else {
			setExpanded(true);
		}
	}, [setExpanded]);

	const startPlayback = useCallback(async () => {
		if (started) return;
		setStarted(true);
		const YT = await loadYtApi();
		if (!mountRef.current) return;
		playerRef.current = new YT.Player(mountRef.current, {
			videoId: youtubeVideoId,
			playerVars: {
				// rel: 0 — related videos wyłączone na poziomie embeda (#198).
				// controls=1 tylko na starych iPhone'ach — apple'owy fullscreen YT.
				rel: 0,
				controls: isAppleMobileWithoutFs ? 1 : 0,
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
						// Bezpiecznik (gdyby timer nie zdążył): klatka ~0.3s przed końcem
						// zamiast ekranu końcowego YT, potem „Odtwórz ponownie".
						const player = playerRef.current;
						const total = player?.getDuration() || 0;
						player?.seekTo(Math.max(0, total - 0.3), true);
						player?.pauseVideo();
						setEnded(true);
						stopProgressTimer();
					}
				},
			},
		});
	}, [started, youtubeVideoId, isAppleMobileWithoutFs, startProgressTimer, stopProgressTimer]);

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

	/** Tryb immersyjny: systemowy fullscreen LUB CSS fallback w dialogu. */
	const immersive = expanded || nativeFs;

	const playerSurface = (
		<>
			{/* Miejsce na iframe (YT API podmienia ten element przy starcie).
			    pointer-events none na iframe: YouTube nie dostaje hovera/klików,
			    więc NIE pokazuje swoich pasków (udostępnij/ustawienia) — reviza usera. */}
			{started ? (
				<div
					ref={mountRef}
					// Na starym iPhonie iframe dostaje tapnięcia — YT sam obsługuje pauzę,
					// pasek i apple'owy fullscreen (nasz overlay by je przechwycił).
					className={cn(
						"absolute inset-0 h-full w-full",
						!isAppleMobileWithoutFs && "[&_iframe]:pointer-events-none",
					)}
				/>
			) : null}

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
			) : isAppleMobileWithoutFs ? // Stary iPhone: ŻADNEGO overlaya — tapnięcia trafiają w YouTube.
			null : (
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
		</>
	);

	const controlBar = (
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
				className={cn(
					"h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full",
					immersive ? "bg-white/20" : "bg-muted",
				)}
			>
				<div
					className="h-full rounded-full bg-primary transition-[width] duration-200"
					style={{ width: `${progress}%` }}
				/>
			</div>
			{!isAppleMobileWithoutFs && (
				<button
					type="button"
					aria-label={immersive ? "Zamknij pełny ekran" : "Pełny ekran"}
					onClick={toggleFullscreen}
					className={cn(
						"flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
						immersive
							? "text-white/80 hover:bg-white/10 hover:text-white"
							: "text-muted-foreground hover:bg-accent hover:text-foreground",
					)}
				>
					{immersive ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
				</button>
			)}
		</div>
	);

	// JEDNA struktura DOM dla trybu zwykłego i pełnoekranowego: przełączenie
	// zmienia tylko KLASY, więc węzeł iframe nie jest przenoszony (przeniesienie
	// przeładowałoby wideo). W pełnym ekranie player wypełnia dialog (h-full) —
	// to DIALOG rozszerza się na ekran (transform Radixa blokował fixed w środku).
	return (
		<div
			className={cn(
				"flex flex-col",
				expanded
					? "h-full w-full bg-black"
					: "overflow-hidden rounded-lg border border-border bg-card",
			)}
		>
			<div
				ref={wrapperRef}
				className={cn(
					"relative w-full overflow-hidden bg-black",
					expanded
						? "flex min-h-0 flex-1 items-center justify-center"
						: "aspect-video rounded-t-lg",
				)}
			>
				{playerSurface}
			</div>
			{controlBar}
			{expanded && (
				<button
					type="button"
					aria-label="Zamknij pełny ekran"
					onClick={() => {
						setExpanded(false);
					}}
					className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/30 transition-colors hover:bg-black hover:text-white"
				>
					<X className="size-6" />
				</button>
			)}
		</div>
	);
}
