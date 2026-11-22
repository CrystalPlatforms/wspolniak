// SPDX-License-Identifier: AGPL-3.0-or-later
type PushPayloadInput =
	| { type: "new_post"; authorName: string; postId: string }
	| { type: "new_comment"; authorName: string; postId: string; snippet: string }
	| { type: "mention"; actorName: string; postId: string };

export interface PushPayload {
	title: string;
	body: string;
	icon: string;
	url: string;
}

export interface SubscriptionInfo {
	endpoint: string;
	p256dh: string;
	auth: string;
	// Potrzebne do logowania delivery events (recordDelivery) w fan-out.
	userId: string;
}

interface FanOutDeps {
	subscriptions: SubscriptionInfo[];
	payload: PushPayload;
	sendPush: (subscription: SubscriptionInfo, payload: PushPayload) => Promise<Response>;
	deleteSubscription: (endpoint: string) => Promise<unknown>;
	// backward compat — wołane tylko przy non-OK (failure HTTP).
	onSendError?: (endpoint: string, status: number) => void;
	// Wołane po KAŻDEJ próbie (success/gone/failure), z userId i statusem (null przy throw).
	onSendOutcome?: (
		outcome: "success" | "gone" | "failure",
		endpoint: string,
		userId: string,
		statusCode: number | null,
	) => void | Promise<void>;
}

const ICON = "/logo192.png";

export function buildPushPayload(input: PushPayloadInput): PushPayload {
	switch (input.type) {
		case "new_post":
			return {
				title: `${input.authorName} dodał(a) zdjęcie`,
				body: "",
				icon: ICON,
				url: `/app/post/${input.postId}`,
			};
		case "new_comment":
			return {
				title: `${input.authorName} skomentował(a) Twoje zdjęcie`,
				body: input.snippet,
				icon: ICON,
				url: `/app/post/${input.postId}`,
			};
		case "mention":
			return {
				title: `${input.actorName} wspomniał(a) o Tobie w komentarzu`,
				body: "",
				icon: ICON,
				url: `/app/post/${input.postId}`,
			};
	}
}

export async function fanOutPush({
	subscriptions,
	payload,
	sendPush,
	deleteSubscription,
	onSendError,
	onSendOutcome,
}: FanOutDeps): Promise<void> {
	await Promise.allSettled(
		subscriptions.map(async (sub) => {
			try {
				const response = await sendPush(sub, payload);
				if (response.status === 410) {
					await deleteSubscription(sub.endpoint);
					await onSendOutcome?.("gone", sub.endpoint, sub.userId, response.status);
				} else if (response.ok) {
					await onSendOutcome?.("success", sub.endpoint, sub.userId, response.status);
				} else {
					onSendError?.(sub.endpoint, response.status);
					await onSendOutcome?.("failure", sub.endpoint, sub.userId, response.status);
				}
			} catch {
				// sendPush rzucił — logujemy failure bez statusu, fan-out kontynuuje.
				await onSendOutcome?.("failure", sub.endpoint, sub.userId, null);
			}
		}),
	);
}
