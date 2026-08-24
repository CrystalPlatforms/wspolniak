// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactionTarget } from "@/db/post-reactions/queries";
import { type ReactionType, reactionTypes } from "@/db/post-reactions/table";

export interface ReactionConfigEntry {
	/** Polska etykieta (aria-label, dialogi). Obrazek emoji = slug typu (/public/emoji). */
	label: string;
}

export const REACTION_CONFIG: Record<ReactionType, ReactionConfigEntry> = {
	heart: { label: "serce" },
	laugh: { label: "śmiech" },
	flame: { label: "ogień" },
	wow: { label: "zdziwienie" },
	sad: { label: "smutek" },
};

export const REACTION_ORDER: readonly ReactionType[] = reactionTypes;

/** Stable, target-scoped query/cache key shared by EmojiReactions. */
export function targetKey(target: ReactionTarget): readonly unknown[] {
	return target.kind === "post"
		? (["reactions", "post", target.postId] as const)
		: (["reactions", "comment", target.postId, target.commentId] as const);
}

export function targetUrls(target: ReactionTarget): {
	counts: string;
	myReaction: string;
	users: string;
} {
	const base =
		target.kind === "post"
			? `/api/app/posts/${target.postId}`
			: `/api/app/posts/${target.postId}/comments/${target.commentId}`;
	return {
		counts: `${base}/reactions`,
		myReaction: `${base}/my-reaction`,
		users: `${base}/reactions/users`,
	};
}
