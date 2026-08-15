// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useState } from "react";
import type { ReactionTarget } from "@/db/post-reactions/queries";
import type { ReactionType } from "@/db/post-reactions/table";
import { REACTION_CONFIG, REACTION_ORDER, targetKey, targetUrls } from "./reaction-config";

interface ReactionBarProps {
	target: ReactionTarget;
}

type Counts = Record<string, number>;
type MyReaction = { reactionType: ReactionType } | null;
interface OptimisticContext {
	previousCounts: Counts | undefined;
	previousMyReaction: MyReaction | undefined;
}

async function fetchCounts(url: string): Promise<Counts> {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Failed to fetch reactions");
	const json = (await res.json()) as { data: Counts };
	return json.data;
}

async function fetchMyReaction(url: string): Promise<MyReaction> {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Failed to fetch reaction");
	const json = (await res.json()) as { data: MyReaction };
	return json.data;
}

async function postReaction(url: string, reactionType: ReactionType) {
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ reactionType }),
	});
	if (!res.ok) throw new Error("Failed to set reaction");
	return res.json();
}

async function deleteReactionRequest(url: string) {
	const res = await fetch(url, { method: "DELETE" });
	if (!res.ok) throw new Error("Failed to remove reaction");
	return res.json();
}

function applyOptimisticCounts(
	counts: Counts,
	from: ReactionType | undefined,
	to: ReactionType,
): Counts {
	const next = { ...counts };
	if (from && next[from] !== undefined) {
		next[from] = Math.max(0, next[from] - 1);
	}
	next[to] = (next[to] ?? 0) + 1;
	return next;
}

function applyOptimisticRemoval(counts: Counts, from: ReactionType | undefined): Counts {
	const next = { ...counts };
	if (from) {
		next[from] = Math.max(0, next[from] - 1);
	}
	return next;
}

export function ReactionBar({ target }: ReactionBarProps) {
	const queryClient = useQueryClient();
	const urls = targetUrls(target);
	const countsKey = [...targetKey(target), "counts"] as const;
	const myKey = [...targetKey(target), "mine"] as const;
	const usersKey = [...targetKey(target), "users"] as const;
	const [poppingType, setPoppingType] = useState<ReactionType | null>(null);

	const { data: counts = {} } = useQuery({
		queryKey: countsKey,
		queryFn: () => fetchCounts(urls.counts),
	});
	const { data: myReaction } = useQuery({
		queryKey: myKey,
		queryFn: () => fetchMyReaction(urls.myReaction),
	});

	function rollbackOptimistic(context: OptimisticContext | undefined) {
		if (context?.previousCounts !== undefined) {
			queryClient.setQueryData(countsKey, context.previousCounts);
		}
		if (context?.previousMyReaction !== undefined) {
			queryClient.setQueryData(myKey, context.previousMyReaction);
		}
	}

	async function invalidateReactionQueries() {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: countsKey }),
			queryClient.invalidateQueries({ queryKey: myKey }),
			// Refresh the "who reacted" list so it reflects the change.
			queryClient.invalidateQueries({ queryKey: usersKey }),
		]);
	}

	// One mutation handles both setting (a reaction type) and removing (null).
	const mutation = useMutation<unknown, Error, ReactionType | null, OptimisticContext>({
		mutationFn: (reactionType) =>
			reactionType ? postReaction(urls.counts, reactionType) : deleteReactionRequest(urls.counts),
		onMutate: async (reactionType): Promise<OptimisticContext> => {
			await queryClient.cancelQueries({ queryKey: countsKey });
			await queryClient.cancelQueries({ queryKey: myKey });

			const previousCounts = queryClient.getQueryData<Counts>(countsKey);
			const previousMyReaction = queryClient.getQueryData<MyReaction>(myKey);
			const currentReaction = previousMyReaction?.reactionType;

			queryClient.setQueryData<Counts>(countsKey, (old = {}) =>
				reactionType
					? applyOptimisticCounts(old, currentReaction, reactionType)
					: applyOptimisticRemoval(old, currentReaction),
			);
			const nextReaction: MyReaction = reactionType ? { reactionType } : null;
			queryClient.setQueryData<MyReaction>(myKey, nextReaction);
			if (reactionType) setPoppingType(reactionType);

			return { previousCounts, previousMyReaction };
		},
		onError: (
			_error: Error,
			_type: ReactionType | null,
			context: OptimisticContext | undefined,
		) => {
			rollbackOptimistic(context);
		},
		onSuccess: () => invalidateReactionQueries(),
	});

	const selected = myReaction?.reactionType;

	const handleSelect = (type: ReactionType) => {
		mutation.mutate(selected === type ? null : type);
	};

	return (
		<div className="inline-flex items-center gap-1" data-slot="reaction-bar">
			{REACTION_ORDER.map((type) => {
				const { Icon, label, color, filled } = REACTION_CONFIG[type];
				const count = counts[type] ?? 0;
				const isSelected = selected === type;
				const isPopping = poppingType === type;
				const style: CSSProperties = {};
				if (isSelected) style.color = color;
				if (isPopping) style.animation = "reaction-pop 300ms ease-in-out";
				return (
					<button
						key={type}
						type="button"
						data-reaction-type={type}
						aria-label={label}
						aria-pressed={isSelected}
						onClick={() => handleSelect(type)}
						style={style}
						className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent ${
							isSelected ? "" : "text-muted-foreground"
						}`}
					>
						<Icon className="size-5" fill={isSelected && filled ? "currentColor" : "none"} />
						<span>{count}</span>
					</button>
				);
			})}
		</div>
	);
}
