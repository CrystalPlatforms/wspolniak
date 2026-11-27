// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactionTarget } from "@/db/post-reactions/queries";
import type { ReactionType } from "@/db/post-reactions/reaction-types";
import { cn } from "@/lib/utils";
import { AppleEmoji } from "./apple-emoji";
import { ReactionsDialog } from "./post-who-reacted";
import { REACTION_CONFIG, REACTION_ORDER, targetKey, targetUrls } from "./reaction-config";

interface ReactionChipsProps {
	target: ReactionTarget;
}

type CountsRecord = Record<string, number>;

export interface RankedReaction {
	type: ReactionType;
	count: number;
}

/** Desktop: top 3; mobile: top 2 — trzeci chip chowa CSS (hidden sm:inline-flex). */
const MAX_CHIPS = 3;

/**
 * Ranking reakcji wg liczby (malejąco); remisy w stałej kolejności konfigu.
 * Tylko typy z liczbą > 0.
 */
export function rankReactions(counts: CountsRecord): RankedReaction[] {
	return REACTION_ORDER.map((type) => ({ type, count: counts[type] ?? 0 }))
		.filter((entry) => entry.count > 0)
		.sort(
			(a, b) =>
				b.count - a.count || REACTION_ORDER.indexOf(a.type) - REACTION_ORDER.indexOf(b.type),
		);
}

async function fetchCounts(url: string): Promise<CountsRecord> {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Failed to fetch reaction counts");
	const json = (await res.json()) as { data?: CountsRecord };
	return json.data ?? {};
}

/**
 * Chipsy najpopularniejszych reakcji na karcie feedu: emoji + liczba (np. 🔥 5),
 * top 3 na desktopie / top 2 na mobile. Klik otwiera dialog „Kto zareagował"
 * (wspólny ReactionsDialog). Post bez reakcji — komponent nie renderuje nic.
 */
export function ReactionChips({ target }: ReactionChipsProps) {
	const [open, setOpen] = useState(false);
	const countsKey = [...targetKey(target), "counts"] as const;
	const { data: counts } = useQuery({
		queryKey: countsKey,
		queryFn: () => fetchCounts(targetUrls(target).counts),
	});

	const ranked = counts ? rankReactions(counts) : [];
	if (ranked.length === 0) return null;

	return (
		<>
			<div className="flex items-center gap-1" data-slot="reaction-chips">
				{ranked.slice(0, MAX_CHIPS).map((entry, index) => (
					<button
						key={entry.type}
						type="button"
						onClick={() => setOpen(true)}
						aria-label={`Kto zareagował: ${REACTION_CONFIG[entry.type].label} (${entry.count})`}
						className={cn(
							"inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-accent",
							index === MAX_CHIPS - 1 && "hidden sm:inline-flex",
						)}
					>
						<AppleEmoji name={entry.type} size={16} />
						{entry.count}
					</button>
				))}
			</div>
			<ReactionsDialog target={target} open={open} onOpenChange={setOpen} />
		</>
	);
}
