// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from "react";
import { AppleEmoji } from "@/components/app/apple-emoji";
import { REACTION_CONFIG, REACTION_ORDER } from "@/components/app/reaction-config";
import { BubbleReactions } from "@/components/ui/bubble";
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
	/** Własna wiadomość → pigułka przy prawym rogu dymka; cudza → lewym. */
	own: boolean;
}

/**
 * Podgląd reakcji na dymku czatu (#231): pigułka BubbleReactions (shadcn)
 * nałożona na dolną krawędź dymka. Reakcje WSZYSTKICH — także własne (reakcja
 * ma być od razu widoczna na wiadomości, revizja #161). Typy bez duplikatów
 * w kolejności konfigu, cap z szerokości dymka. Pigułka dekoracyjna — pełna
 * lista w dialogu „Kto zareagował" (menu dymka).
 */
export function ChatBubbleReactions({ messageId, own }: ChatBubbleReactionsProps) {
	const reactions = useChatReactions(messageId);
	// Typy obecne na wiadomości (ktokolwiek), bez duplikatów, kolejność konfigu.
	const types = REACTION_ORDER.filter((type) => reactions.some((item) => item.reaction === type));

	const pillRef = useRef<HTMLDivElement>(null);
	const [max, setMax] = useState(types.length);

	useEffect(() => {
		if (types.length === 0) return;
		const pill = pillRef.current;
		const bubble = pill?.parentElement;
		if (!pill || !bubble) return;
		const update = () => setMax(maxVisibleReactions(bubble.clientWidth));
		update();
		const observer = new ResizeObserver(update);
		observer.observe(bubble);
		return () => observer.disconnect();
	}, [types.length]);

	if (types.length === 0) return null;

	// Docs shadcn „Labeling Reactions": jedno role=img z opisem zamiast gołych emoji.
	const label = `Reakcje: ${types.map((type) => REACTION_CONFIG[type].label).join(", ")}`;

	return (
		<BubbleReactions
			ref={pillRef}
			data-chat-bubble-reactions
			align={own ? "end" : "start"}
			role="img"
			aria-label={label}
			className="pointer-events-none"
		>
			{types.slice(0, max).map((type: ReactionType) => (
				<AppleEmoji key={type} name={type} size={14} />
			))}
		</BubbleReactions>
	);
}
