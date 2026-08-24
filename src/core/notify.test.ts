// SPDX-License-Identifier: AGPL-3.0-or-later
import { notifyChatMessage, notifyMentions, notifyNewComment, notifyNewPost } from "./notify";

function createDeps() {
	return {
		getActiveSubscriptions: vi.fn().mockResolvedValue([]),
		getSubscriptionsByUserId: vi.fn().mockResolvedValue([]),
		sendPush: vi.fn().mockResolvedValue(new Response(null, { status: 201 })),
		deleteSubscription: vi.fn(),
	};
}

describe("notifyNewPost", () => {
	it("sends push to all subscriptions except the author", async () => {
		const deps = createDeps();
		deps.getActiveSubscriptions.mockResolvedValue([
			{ endpoint: "https://push.example.com/s1", p256dh: "k1", auth: "a1" },
			{ endpoint: "https://push.example.com/s2", p256dh: "k2", auth: "a2" },
		]);

		await notifyNewPost(deps, "author-1", "Mama", "post-1");

		expect(deps.getActiveSubscriptions).toHaveBeenCalledWith("author-1");
		expect(deps.sendPush).toHaveBeenCalledTimes(2);
		expect(deps.sendPush.mock.calls[0]?.[1]).toMatchObject({
			title: "Mama dodał(a) zdjęcie",
			url: "/app/post/post-1",
		});
	});

	it("does nothing when no subscriptions exist", async () => {
		const deps = createDeps();

		await notifyNewPost(deps, "author-1", "Mama", "post-1");

		expect(deps.sendPush).not.toHaveBeenCalled();
	});
});

describe("notifyNewComment", () => {
	it("sends push to the post author", async () => {
		const deps = createDeps();
		deps.getSubscriptionsByUserId.mockResolvedValue([
			{ endpoint: "https://push.example.com/s1", p256dh: "k1", auth: "a1" },
		]);

		await notifyNewComment(deps, "commenter-1", "Tata", "post-author-1", "post-1", "Fajne!");

		expect(deps.getSubscriptionsByUserId).toHaveBeenCalledWith("post-author-1");
		expect(deps.sendPush).toHaveBeenCalledTimes(1);
		expect(deps.sendPush.mock.calls[0]?.[1]).toMatchObject({
			title: "Tata skomentował(a) Twoje zdjęcie",
			body: "Fajne!",
			url: "/app/post/post-1",
		});
	});

	it("skips notification when commenter is the post author", async () => {
		const deps = createDeps();

		await notifyNewComment(deps, "same-user", "Mama", "same-user", "post-1", "Self comment");

		expect(deps.getSubscriptionsByUserId).not.toHaveBeenCalled();
		expect(deps.sendPush).not.toHaveBeenCalled();
	});
});

describe("notifyMentions", () => {
	it("sends a mention push to each mentioned user with subscriptions", async () => {
		const deps = createDeps();
		deps.getSubscriptionsByUserId.mockImplementation((userId: string) => {
			if (userId === "u-ania") {
				return Promise.resolve([
					{ endpoint: "https://push.example.com/ania", p256dh: "k", auth: "a" },
				]);
			}
			if (userId === "u-andrzej") {
				return Promise.resolve([
					{ endpoint: "https://push.example.com/andrzej", p256dh: "k2", auth: "a2" },
				]);
			}
			return Promise.resolve([]);
		});

		await notifyMentions(deps, "u-kasia", "Kasia", ["u-ania", "u-andrzej"], "post-9");

		expect(deps.getSubscriptionsByUserId).toHaveBeenCalledWith("u-ania");
		expect(deps.getSubscriptionsByUserId).toHaveBeenCalledWith("u-andrzej");
		expect(deps.sendPush).toHaveBeenCalledTimes(2);
		expect(deps.sendPush.mock.calls[0]?.[1]).toMatchObject({
			title: "Kasia wspomniał(a) o Tobie w komentarzu",
			url: "/app/post/post-9",
		});
	});

	it("skips self-mention — does not look up the actor's subscriptions", async () => {
		const deps = createDeps();

		await notifyMentions(deps, "u-kasia", "Kasia", ["u-kasia", "u-ania"], "post-9");

		expect(deps.getSubscriptionsByUserId).not.toHaveBeenCalledWith("u-kasia");
	});

	it("deduplicates mentions of the same user — one lookup per user", async () => {
		const deps = createDeps();
		deps.getSubscriptionsByUserId.mockResolvedValue([
			{ endpoint: "https://push.example.com/ania", p256dh: "k", auth: "a" },
		]);

		await notifyMentions(deps, "u-kasia", "Kasia", ["u-ania", "u-ania"], "post-9");

		expect(deps.getSubscriptionsByUserId).toHaveBeenCalledTimes(1);
		expect(deps.sendPush).toHaveBeenCalledTimes(1);
	});

	it("does nothing when no users are mentioned", async () => {
		const deps = createDeps();

		await notifyMentions(deps, "u-kasia", "Kasia", [], "post-9");

		expect(deps.getSubscriptionsByUserId).not.toHaveBeenCalled();
		expect(deps.sendPush).not.toHaveBeenCalled();
	});

	it("does not send push when mentioned users have no subscriptions", async () => {
		const deps = createDeps();
		deps.getSubscriptionsByUserId.mockResolvedValue([]);

		await notifyMentions(deps, "u-kasia", "Kasia", ["u-ania"], "post-9");

		expect(deps.sendPush).not.toHaveBeenCalled();
	});
});

// Założenia kontraktu (F7 #158):
// - notifyChatMessage(deps, room, authorId): subskrybenci z getActiveSubscriptions
//   (store już wyklucza autora zapytaniem; fan-out dodatkowo defensive) minus
//   connected set z DO minus throttlowani (1 push / 2 min). Payload generyczny:
//   tytuł "Nowa wiadomość ze Wspólniaka", bez treści, link /app/chat.
// - Throttle konsumowany TYLKO dla niepodłączonych odbiorców.
function chatSub(userId: string) {
	return {
		endpoint: `https://push.example.com/${userId}`,
		p256dh: "k",
		auth: "a",
		userId,
	};
}

function createChatRoom(connected: string[] = [], throttleAllows = true) {
	return {
		getConnectedUserIds: vi.fn().mockResolvedValue(connected),
		checkAndIncrementPushThrottle: vi.fn().mockImplementation(async () => throttleAllows),
	};
}

describe("notifyChatMessage (F7 #158)", () => {
	it("sends the generic chat push to non-connected subscribers, excluding the author", async () => {
		const deps = createDeps();
		deps.getActiveSubscriptions.mockResolvedValue([chatSub("u2"), chatSub("u3")]);

		await notifyChatMessage(deps, createChatRoom(["u3"]), "u1");

		// Store wyklucza autora już zapytaniem (argument authorId).
		expect(deps.getActiveSubscriptions).toHaveBeenCalledWith("u1");
		// u3 podłączony (widzi live) — push tylko do u2.
		expect(deps.sendPush).toHaveBeenCalledTimes(1);
		expect(deps.sendPush.mock.calls[0]?.[0]).toMatchObject({ userId: "u2" });
		expect(deps.sendPush.mock.calls[0]?.[1]).toEqual({
			title: "Nowa wiadomość ze Wspólniaka",
			body: "",
			icon: "/logo192.png",
			url: "/app/chat",
		});
	});

	it("never sends to the author even if their subscription leaks into the list", async () => {
		const deps = createDeps();
		deps.getActiveSubscriptions.mockResolvedValue([chatSub("u1"), chatSub("u2")]);

		await notifyChatMessage(deps, createChatRoom(), "u1");

		expect(deps.sendPush).toHaveBeenCalledTimes(1);
		expect(deps.sendPush.mock.calls[0]?.[0]).toMatchObject({ userId: "u2" });
	});

	it("skips a user throttled within the 2-minute window", async () => {
		const deps = createDeps();
		deps.getActiveSubscriptions.mockResolvedValue([chatSub("u2"), chatSub("u3")]);

		const room = createChatRoom([], false);
		await notifyChatMessage(deps, room, "u1");

		expect(deps.sendPush).not.toHaveBeenCalled();
		expect(room.checkAndIncrementPushThrottle).toHaveBeenCalledWith("u2");
		expect(room.checkAndIncrementPushThrottle).toHaveBeenCalledWith("u3");
	});

	it("does not consume the throttle of connected users", async () => {
		const deps = createDeps();
		deps.getActiveSubscriptions.mockResolvedValue([chatSub("u2"), chatSub("u3")]);

		const room = createChatRoom(["u2"]);
		await notifyChatMessage(deps, room, "u1");

		expect(room.checkAndIncrementPushThrottle).toHaveBeenCalledTimes(1);
		expect(room.checkAndIncrementPushThrottle).toHaveBeenCalledWith("u3");
	});

	it("does nothing when there are no subscriptions", async () => {
		const deps = createDeps();
		const room = createChatRoom();

		await notifyChatMessage(deps, room, "u1");

		expect(deps.sendPush).not.toHaveBeenCalled();
		expect(room.getConnectedUserIds).not.toHaveBeenCalled();
	});
});
