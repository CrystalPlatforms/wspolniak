// SPDX-License-Identifier: AGPL-3.0-or-later
import "./beam-border.css";
import { BorderBeam } from "border-beam";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface BeamBorderProps {
	/** false = animacja staje w miejscu (np. gdy użytkownik pisze). Domyślnie jedzie. */
	active?: boolean;
	/** „md" = pełna obwódka; „line" = beam tylko na dolnej krawędzi (wyszukiwarka). */
	variant?: "md" | "line";
	className?: string;
	children: React.ReactNode;
}

/**
 * Animowana obwódka „Border Beam" — w całości napędzona biblioteką
 * `border-beam` (beam.jakubantalik.com), wariant „mono" (bez hue-animacji),
 * więc beam-border.css zabarwia jego glow na brandową zieleń stabilnym
 * filtrem. Sprostowania grubości/jasności (tylko dla „md") są scopingowane
 * klasą .beam-variant-md, żeby nie dotykały linii. Motyw (dark/light)
 * śledzi klasę na <html> z naszego ThemeProvidera.
 */
export function BeamBorder({
	active = true,
	variant = "md",
	className,
	children,
}: BeamBorderProps) {
	const theme = useHtmlTheme();
	return (
		<BorderBeam
			size={variant}
			colorVariant="mono"
			duration={variant === "line" ? 3 : 6}
			theme={theme}
			active
			className={cn(
				variant === "line" ? "beam-variant-line" : "beam-variant-md",
				!active && "beam-paused",
				className,
			)}
		>
			{children}
		</BorderBeam>
	);
}

/** Motyw z klasy .dark/.light na <html> (tak zarządza nim ThemeProvider).
 *  Hydration-safe: pierwszy render zawsze "dark" (zgodnie z SSR), właściwy
 *  motyw doskakuje dopiero po montażu — inaczej React widzi mismatch. */
function useHtmlTheme(): "dark" | "light" {
	const [theme, setTheme] = useState<"dark" | "light">("dark");

	useEffect(() => {
		const root = document.documentElement;
		const sync = () => setTheme(root.classList.contains("light") ? "light" : "dark");
		sync();
		const observer = new MutationObserver(sync);
		observer.observe(root, { attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);

	return theme;
}
