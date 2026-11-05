// SPDX-License-Identifier: AGPL-3.0-or-later
// Źródło: shadcn/ui registry (styl base-rhea), komponent "bubble" — przycięty do
// BubbleReactions (#231). Bubble/BubbleContent/BubbleGroup dojdą, gdy będą
// używane (pełna wersja wymaga @base-ui/react).

import { cva } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const bubbleReactionsVariants = cva(
	"absolute z-10 flex w-fit shrink-0 items-center justify-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-sm ring-3 ring-card has-[button]:p-0",
	{
		variants: {
			side: {
				top: "top-0 -translate-y-3/4",
				bottom: "bottom-0 translate-y-3/4",
			},
			align: {
				start: "left-3",
				end: "right-3",
			},
		},
		defaultVariants: {
			side: "bottom",
			align: "end",
		},
	},
);

function BubbleReactions({
	side = "bottom",
	align = "end",
	className,
	...props
}: React.ComponentProps<"div"> & {
	align?: "start" | "end";
	side?: "top" | "bottom";
}) {
	return (
		<div
			data-slot="bubble-reactions"
			data-align={align}
			data-side={side}
			className={cn(bubbleReactionsVariants({ side, align }), className)}
			{...props}
		/>
	);
}

export { BubbleReactions };
