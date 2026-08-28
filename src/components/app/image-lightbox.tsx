// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	ChevronLeft,
	ChevronRight,
	Download,
	Images,
	Maximize,
	X,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AddToAlbumButton } from "@/components/app/add-to-album-button";
import { Loader } from "@/components/ui/loader";
import { downloadImage } from "@/lib/download-image";
import { clampOffset, MAX_ZOOM, MIN_ZOOM, usePinchZoom } from "./use-pinch-zoom";

interface LightboxImage {
	id: string;
	src: string;
	alt: string;
	/** Obecne -> przycisk "Dodaj do albumu" przy obrazie (#171, mount w PostView). */
	cfImageId?: string;
}

interface ImageLightboxProps {
	images: LightboxImage[];
	initialIndex?: number;
	open: boolean;
	onClose: () => void;
	/**
	 * Wlacza "Dodaj do albumu" dla obrazow z cfImageId (#171). Domylnie off -
	 * wlacza tylko PostView; lightbox albumu i feedu nie pozycza.
	 */
	canAddToAlbum?: boolean;
}

const SWIPE_THRESHOLD = 50;
const ZOOM_STEP = 1;

interface LightboxTopControlsProps {
	image: LightboxImage;
	downloading: boolean;
	downloadProgress: number;
	showAddToAlbum: boolean;
	onDownload: () => void;
	onClose: () => void;
}

/** Górny pasek lightboxa: "Dodaj do albumu" (#171), "Pobierz" i zamknięcie. */
function LightboxTopControls({
	image,
	downloading,
	downloadProgress,
	showAddToAlbum,
	onDownload,
	onClose,
}: LightboxTopControlsProps) {
	return (
		<div className="fixed right-2 top-2 flex gap-2 p-2 sm:right-4 sm:top-4">
			{showAddToAlbum && (
				<AddToAlbumButton
					kind="post_photo"
					itemRef={image.cfImageId ?? ""}
					ariaLabel="Dodaj zdjęcie do albumu"
					className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-3 text-white backdrop-blur-sm transition-colors hover:bg-white/20 sm:px-3 sm:py-2"
				>
					<Images className="h-8 w-8 sm:h-5 sm:w-5" />
					<span className="text-base font-medium sm:text-sm">Dodaj do albumu</span>
				</AddToAlbumButton>
			)}
			<button
				type="button"
				disabled={downloading}
				onClick={onDownload}
				className="relative flex items-center gap-2 overflow-hidden rounded-full bg-white/10 px-4 py-3 text-white backdrop-blur-sm transition-colors hover:bg-white/20 disabled:cursor-wait sm:px-3 sm:py-2"
				aria-label="Pobierz zdjęcie"
			>
				{downloading && (
					<div
						className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-200"
						style={{ width: `${downloadProgress}%` }}
					/>
				)}
				{downloading ? (
					<Loader className="relative" />
				) : (
					<Download className="relative h-8 w-8 sm:h-5 sm:w-5" />
				)}
				<span className="relative text-base font-medium sm:text-sm">
					{downloading ? `${downloadProgress}%` : "Pobierz"}
				</span>
			</button>
			<button
				type="button"
				onClick={onClose}
				className="rounded-full bg-white/10 p-3 text-white backdrop-blur-sm transition-colors hover:bg-white/20 sm:p-2"
				aria-label="Zamknij"
			>
				<X className="h-8 w-8 sm:h-6 sm:w-6" />
			</button>
		</div>
	);
}

export function ImageLightbox({
	images,
	initialIndex = 0,
	open,
	onClose,
	canAddToAlbum = false,
}: ImageLightboxProps) {
	const [visible, setVisible] = useState(false);
	const [animatingOut, setAnimatingOut] = useState(false);
	const [currentIndex, setCurrentIndex] = useState(initialIndex);
	const [slideDirection, setSlideDirection] = useState<"right" | "left">("right");
	const [downloading, setDownloading] = useState(false);
	const [downloadProgress, setDownloadProgress] = useState(0);
	const [zoom, setZoom] = useState(MIN_ZOOM);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [isPanning, setIsPanning] = useState(false);
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	const wheelAccumRef = useRef(0);
	const imgRef = useRef<HTMLImageElement>(null);
	const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(
		null,
	);

	/**
	 * Keeps the zoomed image inside its frame: the live rect includes the
	 * current transform, so dividing by the zoom yields the displayed size.
	 */
	const clampToFrame = useCallback((value: { x: number; y: number }, z: number) => {
		const el = imgRef.current;
		if (!el) return value;
		const rect = el.getBoundingClientRect();
		return clampOffset(value, z, { width: rect.width / z, height: rect.height / z });
	}, []);
	const pinch = usePinchZoom({
		zoom,
		onZoomChange: setZoom,
		onOffsetReset: () => setOffset({ x: 0, y: 0 }),
	});

	const goNext = useCallback(() => {
		if (images.length <= 1) return;
		setSlideDirection("right");
		setCurrentIndex((i) => (i + 1) % images.length);
		setZoom(MIN_ZOOM);
	}, [images.length]);

	const goPrev = useCallback(() => {
		if (images.length <= 1) return;
		setSlideDirection("left");
		setCurrentIndex((i) => (i - 1 + images.length) % images.length);
		setZoom(MIN_ZOOM);
	}, [images.length]);

	const handleClose = useCallback(() => {
		setAnimatingOut(true);
		setTimeout(() => {
			setVisible(false);
			setAnimatingOut(false);
			onClose();
		}, 150);
	}, [onClose]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") handleClose();
			else if (e.key === "ArrowRight") goNext();
			else if (e.key === "ArrowLeft") goPrev();
		},
		[handleClose, goNext, goPrev],
	);

	const handleWheel = useCallback(
		(e: WheelEvent) => {
			e.preventDefault();
			const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
			wheelAccumRef.current += delta;
			if (Math.abs(wheelAccumRef.current) < SWIPE_THRESHOLD) return;
			wheelAccumRef.current = 0;
			if (delta > 0) goNext();
			else goPrev();
		},
		[goNext, goPrev],
	);

	// Block page scroll and listen for keyboard/wheel
	useEffect(() => {
		if (!open) return;
		setVisible(true);
		setAnimatingOut(false);
		setCurrentIndex(initialIndex);
		setZoom(MIN_ZOOM);
		wheelAccumRef.current = 0;

		document.body.style.overflow = "hidden";
		document.addEventListener("keydown", handleKeyDown);
		document.addEventListener("wheel", handleWheel, { passive: false });

		const handleMouseMove = (e: MouseEvent) => {
			const start = panStartRef.current;
			if (!start) return;
			setOffset({
				x: start.offsetX + (e.clientX - start.x),
				y: start.offsetY + (e.clientY - start.y),
			});
		};
		const handleMouseUp = () => {
			panStartRef.current = null;
			setIsPanning(false);
		};
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.body.style.overflow = "";
			document.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("wheel", handleWheel);
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [open, initialIndex, handleKeyDown, handleWheel]);

	const handleTouchStart = (e: React.TouchEvent) => {
		if (e.touches.length === 2) {
			const a = e.touches[0];
			const b = e.touches[1];
			if (a && b) {
				// Stale swipe/pan traces must not leak into post-pinch touchend.
				touchStartRef.current = null;
				panStartRef.current = null;
				setIsPanning(false);
				pinch.beginPinch([a, b]);
			}
			return;
		}
		const touch = e.touches[0];
		if (!touch) return;
		if (zoom > MIN_ZOOM) {
			panStartRef.current = {
				x: touch.clientX,
				y: touch.clientY,
				offsetX: offset.x,
				offsetY: offset.y,
			};
			setIsPanning(true);
		} else {
			touchStartRef.current = { x: touch.clientX, y: touch.clientY };
		}
	};

	const handleTouchMove = (e: React.TouchEvent) => {
		if (e.touches.length === 2) {
			const a = e.touches[0];
			const b = e.touches[1];
			if (a && b) {
				e.preventDefault();
				pinch.movePinch([a, b]);
			}
			return;
		}
		const start = panStartRef.current;
		if (!start) return;
		const touch = e.touches[0];
		if (!touch) return;
		e.preventDefault();
		setOffset({
			x: start.offsetX + (touch.clientX - start.x),
			y: start.offsetY + (touch.clientY - start.y),
		});
	};

	const handleTouchEnd = (e: React.TouchEvent) => {
		if (pinch.isPinching()) {
			pinch.endPinch();
			return;
		}
		if (panStartRef.current) {
			panStartRef.current = null;
			setIsPanning(false);
			return;
		}
		const start = touchStartRef.current;
		if (!start) return;
		touchStartRef.current = null;

		const touch = e.changedTouches[0];
		if (!touch) return;

		const deltaX = touch.clientX - start.x;
		const deltaY = touch.clientY - start.y;

		if (Math.abs(deltaY) > Math.abs(deltaX)) return;
		if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;

		if (deltaX < 0) goNext();
		else goPrev();
	};

	if (!visible || images.length === 0) return null;

	const image = images[currentIndex];
	if (!image) return null;

	const isOpen = open && !animatingOut;
	const clamped = zoom > MIN_ZOOM ? clampToFrame(offset, zoom) : { x: 0, y: 0 };
	// Jedna flaga zamiast warunku w JSX (limit zlozonosci biome).
	const showAddToAlbum = canAddToAlbum && typeof image.cfImageId === "string";

	const slideClass =
		slideDirection === "right"
			? "animate-in slide-in-from-right duration-200"
			: "animate-in slide-in-from-left duration-200";

	// Portal do body — fixed overlay musi uciec przed sticky/overflow kontekstami
	// strony posta (naprawa: sekcja komentarzy przebijala lightbox).
	return createPortal(
		<div
			role="dialog"
			aria-modal="true"
			data-state={isOpen ? "open" : "closed"}
			className="fixed top-0 left-0 right-0 h-dvh z-50 flex flex-col bg-black/90 transition-opacity duration-150 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out"
			onClick={handleClose}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") handleClose();
			}}
			onTouchStart={handleTouchStart}
			onTouchMove={handleTouchMove}
			onTouchEnd={handleTouchEnd}
			style={{ touchAction: "none" }}
		>
			<div
				key={currentIndex}
				className={`relative flex max-h-screen min-h-0 flex-1 items-center justify-center p-4 ${slideClass}`}
			>
				<img
					ref={imgRef}
					src={image.src}
					alt={image.alt}
					className={`max-h-[72vh] max-w-full rounded-lg object-contain ${isPanning ? "" : "transition-transform duration-150"}`}
					style={
						zoom > MIN_ZOOM
							? {
									transform: `translate(${clamped.x}px, ${clamped.y}px) scale(${zoom})`,
									// Beyond 4x show real pixels instead of blur.
									imageRendering: zoom > 4 ? "pixelated" : undefined,
								}
							: undefined
					}
					onMouseDown={(e) => {
						e.stopPropagation();
						if (zoom <= MIN_ZOOM) return;
						panStartRef.current = {
							x: e.clientX,
							y: e.clientY,
							offsetX: offset.x,
							offsetY: offset.y,
						};
						setIsPanning(true);
					}}
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				/>
			</div>

			<LightboxTopControls
				image={image}
				downloading={downloading}
				downloadProgress={downloadProgress}
				showAddToAlbum={showAddToAlbum}
				onDownload={() => {
					setDownloading(true);
					setDownloadProgress(0);
					downloadImage(image.src, `wspolniak-${image.id}.jpg`, (loaded, total) => {
						setDownloadProgress(Math.round((loaded / total) * 100));
					}).finally(() => setDownloading(false));
				}}
				onClose={handleClose}
			/>

			{images.length > 1 && (
				<>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							goPrev();
						}}
						className="fixed left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
						aria-label="Poprzednie zdjęcie"
					>
						<ChevronLeft className="h-6 w-6" />
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							goNext();
						}}
						className="fixed right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
						aria-label="Następne zdjęcie"
					>
						<ChevronRight className="h-6 w-6" />
					</button>
				</>
			)}

			<div className="z-[60] mb-36 mt-2 flex gap-1 self-center rounded-full border border-white/10 bg-black/50 p-1 shadow-lg backdrop-blur-md sm:mb-6">
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
					}}
					className="rounded-full p-3 text-white transition-colors hover:bg-white/20 sm:p-2"
					aria-label="Powiększ zdjęcie"
				>
					<ZoomIn className="h-8 w-8 sm:h-5 sm:w-5" />
				</button>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
					}}
					className="rounded-full p-3 text-white transition-colors hover:bg-white/20 sm:p-2"
					aria-label="Pomniejsz zdjęcie"
				>
					<ZoomOut className="h-8 w-8 sm:h-5 sm:w-5" />
				</button>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						setZoom(MIN_ZOOM);
					}}
					className="rounded-full p-3 text-white transition-colors hover:bg-white/20 sm:p-2"
					aria-label="Wyzeruj powiększenie"
				>
					<Maximize className="h-8 w-8 sm:h-5 sm:w-5" />
				</button>
			</div>
		</div>,
		document.body,
	);
}
