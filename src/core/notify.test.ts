// SPDX-License-Identifier: AGPL-3.0-or-later
import { notifyMentions, notifyNewComment, notifyNewPost } from "./notify";

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
