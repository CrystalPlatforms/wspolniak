// SPDX-License-Identifier: AGPL-3.0-or-later
import "./jelly-ooze.css";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface JellyOozeProps {
	/** szerokość loadera w px (default 60) */
	size?: number;
	className?: string;
}

/**
 * Loader „Jelly ooze" — animacja myślenia AL; zastępuje dawny pulsujący
 * prostokąt. Filtr „gooey" (zlewanie kropek) żyje w ukrytym SVG 0×0.
 */
export function JellyOoze({ size = 60, className }: JellyOozeProps) {
	return (
		<>
			<svg width="0" height="0" aria-hidden="true" className="absolute">
				<defs>
					<filter id="jelly-ooze">
						<feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
						<feColorMatrix
							in="blur"
							mode="matrix"
							values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
							result="ooze"
						/>
						<feBlend in="SourceGraphic" in2="ooze" />
					</filter>
				</defs>
			</svg>
			<output
				aria-label="AL myśli…"
				className={cn("jelly-ooze", className)}
				style={{ "--jelly-size": `${size}px` } as CSSProperties}
			>
				<span className="jelly-ooze-dot" />
				<span className="jelly-ooze-dot" />
				<span className="jelly-ooze-dot" />
				<span className="jelly-ooze-dot" />
				<span className="jelly-ooze-dot" />
			</output>
		</>
	);
}
