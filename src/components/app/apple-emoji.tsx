// SPDX-License-Identifier: AGPL-3.0-or-later
import { cn } from "@/lib/utils";

export interface AppleEmojiProps {
	/** Reakcja/typ — nazwa pliku w /public/emoji (bez rozszerzenia). */
	name: string;
	/** Wymiary w pikselach (obraz 160×160 skalowany w dół). */
	size: number;
	className?: string;
}

/**
 * Emoji w stylu Apple, self-hostowane w /public/emoji (PWA offline #161 —
 * zero requestów do zewnętrznego CDN). Dekoracyjne: alt puste, znaczenie
 * niesie aria-label przycisku-rodzica.
 */
export function AppleEmoji({ name, size, className }: AppleEmojiProps) {
	return (
		<img
			src={`/emoji/${name}.png`}
			alt=""
			width={size}
			height={size}
			draggable={false}
			className={cn("max-w-none select-none", className)}
		/>
	);
}
