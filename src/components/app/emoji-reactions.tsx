// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactionTarget } from "@/db/post-reactions/queries";
import type { ReactionType } from "@/db/post-reactions/table";
import { EmojiReactionPicker } from "./emoji-reaction-picker";
import { targetKey, targetUrls } from "./reaction-config";

interface EmojiReactionsProps {
	target: ReactionTarget;
}

type MyReaction = { reactionType: ReactionType } | null;

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

/**
 * Reakcje 3.0 (#161, rewizja HITL): sam picker — chipsy i liczniki usunięte
 * („kto zareagował" → PostWhoReacted w nagłówku posta). Moja reakcja: emoji na
 * triggerze + zielony ring w pillu (active). Jedna mutacja: null = usunięcie;
 * optimistic update z rollbackem.
 */
export function EmojiReactions({ target }: EmojiReactionsProps) {
	const queryClient = useQueryClient();
	const urls = targetUrls(target);
	const myKey = [...targetKey(target), "mine"] as const;

	const { data: myReaction } = useQuery({
		queryKey: myKey,
		queryFn: () => fetchMyReaction(urls.myReaction),
	});

	const mutation = useMutation<
		unknown,
		Error,
		ReactionType | null,
		{ previous: MyReaction | undefined }
	>({
		mutationFn: (reactionType) =>
			reactionType ? postReaction(urls.counts, reactionType) : deleteReactionRequest(urls.counts),
		onMutate: async (reactionType) => {
			await queryClient.cancelQueries({ queryKey: myKey });
			const previous = queryClient.getQueryData<MyReaction>(myKey);
			const next: MyReaction = reactionType ? { reactionType } : null;
			queryClient.setQueryData<MyReaction>(myKey, next);
			return { previous };
		},
		onError: (_error, _type, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(myKey, context.previous);
			}
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: myKey }),
	});

	const selected = myReaction?.reactionType;

	const handleSelect = (type: ReactionType) => {
		mutation.mutate(selected === type ? null : type);
	};

	return (
		<div className="inline-flex items-center gap-1" data-slot="emoji-reactions">
			<EmojiReactionPicker onReact={handleSelect} last={selected} active={selected} size="sm" />
		</div>
	);
}
