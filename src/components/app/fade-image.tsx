// SPDX-License-Identifier: AGPL-3.0-or-later
import "./fade-image.css";
import { useState } from "react";

interface FadeImageProps {
	src: string;
	alt: string;
	/** Klasy slotu na <img> — łącznie z rezerwacją proporcji (np. aspect-square). */
	className: string;
	/**
	 * Kontrola rodzica: kiedy wygasić placeholder. Brak = self-reveal
	 * w momencie załadowania zdjęcia (PostView). Podany = rodzic decyduje
	 * (choreografia PostCard — fade jest finalnym etapem karty).
	 */
	reveal?: boolean;
	/** Sygnał „bajty gotowe" — do śledzenia etapów choreografii (PostCard). */
	onImageLoad?: () => void;
}

/**
 * Zdjęcie z szarym placeholderem i płynnym fade-in (#146). Lazy loading
 * natywne (`loading="lazy"`), proporcje slotu rezerwuje `className` na <img>.
 * Placeholder zostaje w DOM po wygaszeniu (transition CSS, zero timerów);
 * reduced-motion wyłącza fade w CSS — jak shimmer szkieletów (#145).
 * Rodzic musi być `relative` (overlay to absolute inset-0).
 */
export function FadeImage({ src, alt, className, reveal, onImageLoad }: FadeImageProps) {
	const [loaded, setLoaded] = useState(false);
	const shown = reveal ?? loaded;

	const markLoaded = () => {
		if (loaded) return;
		setLoaded(true);
		onImageLoad?.();
	};

	return (
		<>
			<img
				src={src}
				alt={alt}
				className={className}
				loading="lazy"
				onLoad={markLoaded}
				ref={(el) => {
					// zdjęcia z cache bywają gotowe przed podpięciem onLoad
					if (el?.complete) markLoaded();
				}}
			/>
			<span
				aria-hidden="true"
				data-revealed={shown ? "true" : "false"}
				className={`fade-image-placeholder skeleton absolute inset-0 ${shown ? "fade-image-out" : ""}`}
			/>
		</>
	);
}
