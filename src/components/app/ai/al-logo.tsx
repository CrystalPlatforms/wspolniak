// SPDX-License-Identifier: AGPL-3.0-or-later
import { useId } from "react";
import { cn } from "@/lib/utils";
// Surowe SVG (wbudowana animacja błądzenia/mrugania oczu) — inline przez ?raw.
import logoRaw from "./al-logo.svg?raw";

/**
 * Logo AL — inline SVG z wbudowaną animacją błądzenia i mrugania oczu.
 * Śledzenie kursora usunięte całkowicie na życzenie usera (2026-08-23):
 * oczy błądzą same na każdej platformie. Mask id unikalny per instancja
 * (useId); atrybuty width/height nadpisane na 100%, żeby SVG skalowało
 * się do kontenera (wbite 250×250 wystawało poza div i zasłaniało tekst).
 * `animated={false}` (reviza #187): wyłącza animację — małe przyciski AL
 * mają statyczne logo.
 */
export function AlLogo({ className, animated = true }: { className?: string; animated?: boolean }) {
	const maskId = `al-mask-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

	let markup = logoRaw
		.replaceAll("bot-mask-lgf1i3", maskId)
		.replace('width="250" height="250"', 'width="100%" height="100%" style="display:block"');
	if (!animated) {
		markup = markup.replace("</style>", ".oeil0,.oeil1{animation:none !important}</style>");
	}

	return (
		<div
			className={cn("aspect-square", className)}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: zaufany własny asset (src/.../al-logo.svg), nie input użytkownika
			dangerouslySetInnerHTML={{ __html: markup }}
		/>
	);
}
