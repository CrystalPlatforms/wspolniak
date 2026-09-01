// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
}));

vi.mock("@/db/posts/queries", () => ({
	getPostById: vi.fn(),
}));

vi.mock("@/db/pinned-posts", () => {
	class PinnedLimitError extends Error {
		constructor() {
			super("Osiągnięto limit przypiętych postów (3)");
			this.name = "PinnedLimitError";
		}
	}
	return { pinPost: vi.fn(), unpinPost: vi.fn(), PinnedLimitError };
});

import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import { PinnedLimitError, pinPost, unpinPost } from "@/db/pinned-posts";
import { getPostById } from "@/db/posts/queries";
import pinnedPostsEndpoint from "./pinned-posts";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockGetPost = vi.mocked(getPostById);
const mockPinPost = vi.mocked(pinPost);
const mockUnpinPost = vi.mocked(unpinPost);

function createApi() {
	const api = new Hono<{ Bindings: { SESSION_SECRET: string } }>().basePath("/api/app");
	api.route("/posts", pinnedPostsEndpoint);
	return api;
}

const env = { SESSION_SECRET: "secret" };

function authedRequest(_path: string, init?: RequestInit) {
	return { ...init, headers: { Cookie: "session=valid-jwt", ...init?.headers } };
}

function mockUser(role: "admin" | "member") {
	const id = role === "admin" ? "admin-1" : "member-1";
	mockVerify.mockResolvedValue({ userId: id, name: role, role });
	mockFindUser.mockResolvedValue({
		id,
		name: role,
		role,
		tokenHash: "hash",
		deletedAt: null,
		createdAt: new Date(),
		aiOptIn: false,
		aiBlocked: false,
	});
}

const stubPost = {
	id: "post-1",
	authorId: "u-other",
	description: null,
	createdAt: new Date(),
	updatedAt: new Date(),
	author: { id: "u-other", name: "Kasia" },
	images: [],
};

describe("POST /api/app/posts/:id/pin", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("pins a post as admin (200) and calls pinPost", async () => {
		mockUser("admin");
		mockGetPost.mockResolvedValue(stubPost);
		mockPinPost.mockResolvedValue({ id: "pin-1", postId: "post-1", pinnedAt: new Date() });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/pin",
			authedRequest("/api/app/posts/post-1/pin", { method: "POST" }),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockPinPost).toHaveBeenCalledWith("post-1");
	});

	it("denies a non-admin member (403) and does not pin", async () => {
		mockUser("member");
		mockGetPost.mockResolvedValue(stubPost);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/pin",
			authedRequest("/api/app/posts/post-1/pin", { method: "POST" }),
			env,
		);

		expect(res.status).toBe(403);
		expect(mockPinPost).not.toHaveBeenCalled();
	});

	it("returns 422 when the pinned limit is reached", async () => {
		mockUser("admin");
		mockGetPost.mockResolvedValue(stubPost);
		mockPinPost.mockRejectedValue(new PinnedLimitError());

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/pin",
			authedRequest("/api/app/posts/post-1/pin", { method: "POST" }),
			env,
		);

		expect(res.status).toBe(422);
		const body = (await res.json()) as { error: string };
		expect(body.error).toMatch(/limit/);
	});
});

describe("DELETE /api/app/posts/:id/pin", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("unpins a post as admin (200) and calls unpinPost", async () => {
		mockUser("admin");
		mockUnpinPost.mockResolvedValue({ id: "pin-1", postId: "post-1", pinnedAt: new Date() });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/pin",
			authedRequest("/api/app/posts/post-1/pin", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockUnpinPost).toHaveBeenCalledWith("post-1");
	});

	it("denies a non-admin member (403) and does not unpin", async () => {
		mockUser("member");

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/pin",
			authedRequest("/api/app/posts/post-1/pin", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(403);
		expect(mockUnpinPost).not.toHaveBeenCalled();
	});
});
