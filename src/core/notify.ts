// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PushPayload, SubscriptionInfo } from "@/core/push";
import { buildPushPayload, fanOutPush } from "@/core/push";

interface NotifyDeps {
	getActiveSubscriptions: (excludeUserId: string) => Promise<SubscriptionInfo[]>;
	getSubscriptionsByUserId: (userId: string) => Promise<SubscriptionInfo[]>;
	sendPush: (subscription: SubscriptionInfo, payload: PushPayload) => Promise<Response>;
	deleteSubscription: (endpoint: string) => Promise<unknown>;
	onSendError?: (endpoint: string, status: number) => void;
	onSendOutcome?: (
		outcome: "success" | "gone" | "failure",
		endpoint: string,
		userId: string,
		statusCode: number | null,
	) => void | Promise<void>;
}

export async function notifyNewPost(
	deps: NotifyDeps,
	authorId: string,
	authorName: string,
	postId: string,
): Promise<void> {
	const subscriptions = await deps.getActiveSubscriptions(authorId);
	const payload = buildPushPayload({ type: "new_post", authorName, postId });
	await fanOutPush({
		subscriptions,
		payload,
		sendPush: deps.sendPush,
		deleteSubscription: deps.deleteSubscription,
		onSendError: deps.onSendError,
		onSendOutcome: deps.onSendOutcome,
	});
}

export async function notifyNewComment(
	deps: NotifyDeps,
	commentAuthorId: string,
	commentAuthorName: string,
	postAuthorId: string,
	postId: string,
	snippet: string,
): Promise<void> {
	if (commentAuthorId === postAuthorId) return;

	const subscriptions = await deps.getSubscriptionsByUserId(postAuthorId);
	const payload = buildPushPayload({
		type: "new_comment",
		authorName: commentAuthorName,
		postId,
		snippet,
	});
	await fanOutPush({
		subscriptions,
		payload,
		sendPush: deps.sendPush,
		deleteSubscription: deps.deleteSubscription,
		onSendError: deps.onSendError,
		onSendOutcome: deps.onSendOutcome,
	});
}

/**
 * Wysyła powiadomienie push o @mention do wszystkich wspomnianych osób.
 *
 * userId pochodzi WYŁĄCZNIE z kliknięć w dropdown (frontend przesyła jawną listę) —
 * nigdy z parsowania imienia. To mityguje duplikaty imion (dwaj "Andrzej" → powiadomienie
 * trafia do właściwej osoby z kliknięcia). Ręcznie wpisany `@imię` nie trafia tu w ogóle.
 *
 * - Self-mention (actor wspomniał sam siebie) → brak pusha.
 * - Duplikaty tego samego userId → jedno powiadomienie.
 */
export async function notifyMentions(
	deps: NotifyDeps,
	actorId: string,
	actorName: string,
	mentionedUserIds: string[],
	postId: string,
): Promise<void> {
	const uniqueOthers = [...new Set(mentionedUserIds)].filter((id) => id !== actorId);
	if (uniqueOthers.length === 0) return;

	const subscriptionGroups = await Promise.all(
		uniqueOthers.map((id) => deps.getSubscriptionsByUserId(id)),
	);
	const subscriptions = subscriptionGroups.flat();
	if (subscriptions.length === 0) return;

	const payload = buildPushPayload({ type: "mention", actorName, postId });
	await fanOutPush({
		subscriptions,
		payload,
		sendPush: deps.sendPush,
		deleteSubscription: deps.deleteSubscription,
		onSendError: deps.onSendError,
		onSendOutcome: deps.onSendOutcome,
	});
}
