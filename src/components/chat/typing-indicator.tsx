// SPDX-License-Identifier: AGPL-3.0-or-later
import "./typing-indicator.css";

interface TypingIndicatorProps {
	visible: boolean;
}

/**
 * Anonimowy wskaźnik „ktoś pisze…" (F3 #154) — trzy pulsujące kropki nad inputem.
 * Zawsze zamontowany: widoczność przełączana fadem (opacity + aria-hidden), więc
 * wskaźnik pojawia się i znika bez skoku layoutu. Nigdy nie zdradza, kto pisze.
 */
export function TypingIndicator({ visible }: TypingIndicatorProps) {
	return (
		<div
			data-typing-indicator
			data-visible={visible}
			aria-hidden={!visible}
			className={`flex h-4 items-center gap-1.5 pb-1.5 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
		>
			<span className="flex items-center gap-0.5" aria-hidden="true">
				<span data-typing-dot className="typing-dot" />
				<span data-typing-dot className="typing-dot" />
				<span data-typing-dot className="typing-dot" />
			</span>
			<span className="text-xs text-muted-foreground">ktoś pisze…</span>
		</div>
	);
}
