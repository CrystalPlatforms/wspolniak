// SPDX-License-Identifier: AGPL-3.0-or-later
import { buildPushPayload, fanOutPush, type PushPayload, type SubscriptionInfo } from "./push";

describe("buildPushPayload", () => {
	it("builds payload for a new post notification", () => {
		const payload = buildPushPayload({
			type: "new_post",
			authorName: "Mama",
			postId: "post-123",
		});

		expect(payload).toEqual({
			title: "Mama dodał(a) zdjęcie",
			body: "",
			icon: "/logo192.png",
			url: "/app/post/post-123",
		});
	});

	it("builds payload for a new comment notification", () => {
		const payload = buildPushPayload({
			type: "new_comment",
			authorName: "Tata",
			postId: "post-456",
			snippet: "Super zdjęcie!",
		});

		expect(payload).toEqual({
			title: "Tata skomentował(a) Twoje zdjęcie",
			body: "Super zdjęcie!",
			icon: "/logo192.png",
			url: "/app/post/post-456",
		});
	});

	it("builds payload for a mention notification", () => {
		const payload = buildPushPayload({
			type: "mention",
			actorName: "Kasia",
			postId: "post-789",
		});

		expect(payload).toEqual({
			title: "Kasia wspomniał(a) o Tobie w komentarzu",
			body: "",
			icon: "/logo192.png",
			url: "/app/post/post-789",
		});
	});

	// Założenia kontraktu (F7 #158): tytuł DOKŁADNIE "Nowa wiadomość ze
	// Wspólniaka", bez treści wiadomości (body puste), deep link /app/chat.
	it("builds the generic chat payload — exact title, no content, /app/chat link", () => {
		const payload = buildPushPayload({ type: "chat_message" });

		expect(payload).toEqual({
			title: "Nowa wiadomość ze Wspólniaka",
			body: "",
			icon: "/logo192.png",
			url: "/app/chat",
		});
	});
});

describe("fanOutPush", () => {
	const payload: PushPayload = {
		title: "Test",
		body: "body",
		icon: "/logo192.png",
		url: "/app/post/p1",
	};

	const sub1: SubscriptionInfo = {
		endpoint: "https://push.example.com/sub1",
		p256dh: "key1",
		auth: "auth1",
		userId: "u1",
	};
	const sub2: SubscriptionInfo = {
		endpoint: "https://push.example.com/sub2",
		p256dh: "key2",
		auth: "auth2",
		userId: "u2",
	};

	it("sends push to all provided subscriptions", async () => {
		const sendPush = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
		const deleteSubscription = vi.fn();

		await fanOutPush({
			subscriptions: [sub1, sub2],
			payload,
			sendPush,
			deleteSubscription,
		});

		expect(sendPush).toHaveBeenCalledTimes(2);
		expect(sendPush).toHaveBeenCalledWith(sub1, payload);
		expect(sendPush).toHaveBeenCalledWith(sub2, payload);
		expect(deleteSubscription).not.toHaveBeenCalled();
	});

	it("deletes subscription on 410 Gone response", async () => {
		const sendPush = vi.fn().mockResolvedValue(new Response(null, { status: 410 }));
		const deleteSubscription = vi.fn();

		await fanOutPush({
			subscriptions: [sub1],
			payload,
			sendPush,
			deleteSubscription,
		});

		expect(deleteSubscription).toHaveBeenCalledWith(sub1.endpoint);
	});

	it("calls onSendError on non-410 failure without deleting", async () => {
		const sendPush = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
		const deleteSubscription = vi.fn();
		const onSendError = vi.fn();

		await fanOutPush({
			subscriptions: [sub1],
			payload,
			sendPush,
			deleteSubscription,
			onSendError,
		});

		expect(deleteSubscription).not.toHaveBeenCalled();
		expect(onSendError).toHaveBeenCalledWith(sub1.endpoint, 500);
	});

	it("calls onSendOutcome with 'success' on OK response", async () => {
		const sendPush = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
		const onSendOutcome = vi.fn();

		await fanOutPush({
			subscriptions: [sub1],
			payload,
			sendPush,
			deleteSubscription: vi.fn(),
			onSendOutcome,
		});

		expect(onSendOutcome).toHaveBeenCalledWith("success", sub1.endpoint, sub1.userId, 201);
	});

	it("calls onSendOutcome with 'gone' on 410 and still deletes subscription", async () => {
		const sendPush = vi.fn().mockResolvedValue(new Response(null, { status: 410 }));
		const deleteSubscription = vi.fn();
		const onSendOutcome = vi.fn();

		await fanOutPush({
			subscriptions: [sub1],
			payload,
			sendPush,
			deleteSubscription,
			onSendOutcome,
		});

		expect(deleteSubscription).toHaveBeenCalledWith(sub1.endpoint);
		expect(onSendOutcome).toHaveBeenCalledWith("gone", sub1.endpoint, sub1.userId, 410);
	});

	it("calls onSendOutcome with 'failure' and null status when sendPush throws", async () => {
		const sendPush = vi.fn().mockRejectedValue(new Error("network down"));
		const onSendOutcome = vi.fn();

		await fanOutPush({
			subscriptions: [sub1],
			payload,
			sendPush,
			deleteSubscription: vi.fn(),
			onSendOutcome,
		});

		expect(onSendOutcome).toHaveBeenCalledWith("failure", sub1.endpoint, sub1.userId, null);
	});

	it("calls both onSendError and onSendOutcome on non-410 failure", async () => {
		const sendPush = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
		const onSendError = vi.fn();
		const onSendOutcome = vi.fn();

		await fanOutPush({
			subscriptions: [sub1],
			payload,
			sendPush,
			deleteSubscription: vi.fn(),
			onSendError,
			onSendOutcome,
		});

		expect(onSendError).toHaveBeenCalledWith(sub1.endpoint, 500);
		expect(onSendOutcome).toHaveBeenCalledWith("failure", sub1.endpoint, sub1.userId, 500);
	});

	it("handles empty subscriptions list", async () => {
		const sendPush = vi.fn();
		const deleteSubscription = vi.fn();

		await fanOutPush({
			subscriptions: [],
			payload,
			sendPush,
			deleteSubscription,
		});

		expect(sendPush).not.toHaveBeenCalled();
	});
});
