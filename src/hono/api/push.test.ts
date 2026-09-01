// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
}));

vi.mock("@/db/push-subscriptions/queries", () => ({
	saveSubscription: vi.fn(),
	deleteSubscriptionByEndpoint: vi.fn(),
}));

import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import { deleteSubscriptionByEndpoint, saveSubscription } from "@/db/push-subscriptions/queries";
import pushEndpoint from "./push";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockSave = vi.mocked(saveSubscription);
const mockDelete = vi.mocked(deleteSubscriptionByEndpoint);

function createApi() {
	const api = new Hono<{
		Bindings: { SESSION_SECRET: string };
	}>().basePath("/api/app");
	api.route("/push", pushEndpoint);
	return api;
}

const env = { SESSION_SECRET: "secret" };

function authedRequest(init?: RequestInit) {
	return {
		...init,
		headers: { Cookie: "session=valid-jwt", ...init?.headers },
	};
}

const now = new Date();

describe("POST /api/app/push/subscribe", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
	});

	it("saves a push subscription for the authenticated user", async () => {
		mockSave.mockResolvedValue({
			id: "sub-1",
			userId: "u1",
			endpoint: "https://push.example.com/sub1",
			p256dh: "key1",
			auth: "auth1",
			createdAt: now,
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/push/subscribe",
			authedRequest({
				method: "POST",
				body: JSON.stringify({
					endpoint: "https://push.example.com/sub1",
					keys: { p256dh: "key1", auth: "auth1" },
				}),
				headers: { "Content-Type": "application/json", Cookie: "session=valid-jwt" },
			}),
			env,
		);

		expect(res.status).toBe(201);
		expect(mockSave).toHaveBeenCalledWith({
			userId: "u1",
			endpoint: "https://push.example.com/sub1",
			p256dh: "key1",
			auth: "auth1",
		});
	});

	it("returns 400 on invalid subscription data", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/app/push/subscribe",
			authedRequest({
				method: "POST",
				body: JSON.stringify({ endpoint: "not-a-url" }),
				headers: { "Content-Type": "application/json", Cookie: "session=valid-jwt" },
			}),
			env,
		);

		expect(res.status).toBe(400);
	});

	it("returns 401 without session", async () => {
		mockVerify.mockRejectedValue(new Error("invalid"));

		const api = createApi();
		const res = await api.request(
			"/api/app/push/subscribe",
			{
				method: "POST",
				body: JSON.stringify({
					endpoint: "https://push.example.com/sub1",
					keys: { p256dh: "key1", auth: "auth1" },
				}),
				headers: { "Content-Type": "application/json" },
			},
			env,
		);

		expect(res.status).toBe(401);
	});
});

describe("DELETE /api/app/push/subscribe", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
	});

	it("deletes subscription by endpoint", async () => {
		mockDelete.mockResolvedValue(true);

		const api = createApi();
		const res = await api.request(
			"/api/app/push/subscribe",
			authedRequest({
				method: "DELETE",
				body: JSON.stringify({ endpoint: "https://push.example.com/sub1" }),
				headers: { "Content-Type": "application/json", Cookie: "session=valid-jwt" },
			}),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockDelete).toHaveBeenCalledWith("https://push.example.com/sub1");
	});
});
