// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from "react";
import { AppleEmoji } from "@/components/app/apple-emoji";
import { REACTION_ORDER } from "@/components/app/reaction-config";
import type { ReactionType } from "@/db/post-reactions/table";
import { useChatReactions } from "./chat-reactions";

/** Emoji 14px + gap 4px — tyle sztuk mieści się na szerokości dymka. */
const EMOJI_SLOT_PX = 36;
const MAX_TYPES = 5;

/** Cap zależny od szerokości dymka (min 1, max liczba typów) — czysta funkcja. */
export function maxVisibleReactions(bubbleWidth: number): number {
	return Math.max(1, Math.min(MAX_TYPES, Math.floor(bubbleWidth / EMOJI_SLOT_PX)));
}

interface ChatBubbleReactionsProps {
	messageId: string;
}

/**
 * Małe emoji reakcji na dymku czatu (#161, revizja usera 2026-08-28): reakcje
 * WSZYSTKICH — także własne (reakcja ma być od razu widoczna na wiadomości;
 * zielony ring dla swojej zostaje w pickerze). Typy bez duplikatów w kolejności
 * konfigu, rząd w flow dymka przy samym rogu (self-end, od zewnętrznego rogu
 * wiadomości), overflow-hidden + cap z szerokości dymka — emoji nigdy nie
 * wystają poza dymek.
 */
export function ChatBubbleReactions({ messageId }: ChatBubbleReactionsProps) {
	const reactions = useChatReactions(messageId);
	// Typy obecne na wiadomości (ktokolwiek), bez duplikatów, kolejność konfigu.
	const types = REACTION_ORDER.filter((type) => reactions.some((item) => item.reaction === type));

	const rowRef = useRef<HTMLSpanElement>(null);
	const [max, setMax] = useState(types.length);

	useEffect(() => {
		if (types.length === 0) return;
		const row = rowRef.current;
		const bubble = row?.parentElement;
		if (!row || !bubble) return;
		const update = () => setMax(maxVisibleReactions(bubble.clientWidth));
		update();
		const observer = new ResizeObserver(update);
		observer.observe(bubble);
		return () => observer.disconnect();
	}, [types.length]);

	if (types.length === 0) return null;

	return (
		<span
			ref={rowRef}
			data-chat-bubble-reactions
			// Dekoracyjne — pełna lista w dialogu „Kto zareagował".
			aria-hidden="true"
			className="flex shrink-0 items-center gap-0.5 self-end overflow-hidden"
		>
			{types.slice(0, max).map((type: ReactionType) => (
				<AppleEmoji key={type} name={type} size={14} />
			))}
		</span>
	);
}
