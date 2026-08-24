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
	currentUserId: string;
}

/**
 * Małe emoji reakcji na dymku czatu (rewizja HITL #161): tylko te dane przez
 * INNYCH użytkowników (własna ma zielony ring w pickerze), typy bez duplikatów
 * w kolejności konfigu. Rząd w flow dymka przy samym rogu (self-end, od strony
 * zewnętrznego rogu wiadomości), overflow-hidden + cap z szerokości dymka —
 * emoji nigdy nie wystają poza dymek.
 */
export function ChatBubbleReactions({ messageId, currentUserId }: ChatBubbleReactionsProps) {
	const reactions = useChatReactions(messageId);
	// Typy reakcji innych (bez moich), bez duplikatów, w kolejności konfigu.
	const others = REACTION_ORDER.filter((type) =>
		reactions.some((item) => item.reaction === type && item.userId !== currentUserId),
	);

	const rowRef = useRef<HTMLSpanElement>(null);
	const [max, setMax] = useState(others.length);

	useEffect(() => {
		if (others.length === 0) return;
		const row = rowRef.current;
		const bubble = row?.parentElement;
		if (!row || !bubble) return;
		const update = () => setMax(maxVisibleReactions(bubble.clientWidth));
		update();
		const observer = new ResizeObserver(update);
		observer.observe(bubble);
		return () => observer.disconnect();
	}, [others.length]);

	if (others.length === 0) return null;

	return (
		<span
			ref={rowRef}
			data-chat-bubble-reactions
			// Dekoracyjne — pełna lista w dialogu „Kto zareagował".
			aria-hidden="true"
			className="flex shrink-0 items-center gap-0.5 self-end overflow-hidden"
		>
			{others.slice(0, max).map((type: ReactionType) => (
				<AppleEmoji key={type} name={type} size={14} />
			))}
		</span>
	);
}
