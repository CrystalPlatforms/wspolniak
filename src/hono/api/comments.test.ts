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

vi.mock("@/db/comments/queries", () => ({
	MAX_REPLIES_PER_COMMENT: 5,
	createComment: vi.fn(),
	createReply: vi.fn(),
	countRepliesByComment: vi.fn(),
	listCommentsByPost: vi.fn(),
	getCommentById: vi.fn(),
	updateCommentBody: vi.fn(),
	softDeleteComment: vi.fn(),
}));

vi.mock("@/db/mentions/queries", () => ({
	createMentions: vi.fn(),
}));

import {
	countRepliesByComment,
	createComment,
	createReply,
	getCommentById,
	listCommentsByPost,
	softDeleteComment,
	updateCommentBody,
} from "@/db/comments/queries";
import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import { createMentions } from "@/db/mentions/queries";
import { getPostById } from "@/db/posts/queries";
import commentsEndpoint from "./comments";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockGetPost = vi.mocked(getPostById);
const mockCreateComment = vi.mocked(createComment);
const mockCreateReply = vi.mocked(createReply);
const mockCountReplies = vi.mocked(countRepliesByComment);
const mockListComments = vi.mocked(listCommentsByPost);
const mockGetComment = vi.mocked(getCommentById);
const mockUpdateBody = vi.mocked(updateCommentBody);
const mockSoftDelete = vi.mocked(softDeleteComment);
const mockCreateMentions = vi.mocked(createMentions);

function createApi() {
	const api = new Hono<{
		Bindings: { SESSION_SECRET: string };
	}>().basePath("/api/app");
	api.route("/posts", commentsEndpoint);
	return api;
}

const env = { SESSION_SECRET: "secret" };

function authedRequest(_path: string, init?: RequestInit) {
	return {
		...init,
		headers: { Cookie: "session=valid-jwt", ...init?.headers },
	};
}

const now = new Date();
const samplePost = {
	id: "post-1",
	authorId: "u1",
	description: "Test",
	createdAt: now,
	updatedAt: now,
	author: { id: "u1", name: "Tomek" },
	images: [],
};

const sampleComment = {
	id: "comment-1",
	postId: "post-1",
	authorId: "u1",
	body: "Fajne zdjęcie!",
	parentId: null,
	deletedAt: null,
	createdAt: now,
	updatedAt: now,
};

describe("POST /api/app/posts/:postId/comments", () => {
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

	it("creates comment with valid input", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockCreateComment.mockResolvedValue(sampleComment);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments",
			authedRequest("/api/app/posts/post-1/comments", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Fajne zdjęcie!" }),
			}),
			env,
		);

		expect(res.status).toBe(201);
		const json = (await res.json()) as { data: { id: string } };
		expect(json.data.id).toBe("comment-1");
		expect(mockCreateComment).toHaveBeenCalledWith({
			postId: "post-1",
			authorId: "u1",
			body: "Fajne zdjęcie!",
		});
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Test" }),
			},
			env,
		);

		expect(res.status).toBe(401);
	});

	it("returns 404 when post does not exist", async () => {
		mockGetPost.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/non-existent/comments",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Test" }),
			}),
			env,
		);

		expect(res.status).toBe(404);
	});

	it("returns 400 when body is empty", async () => {
		mockGetPost.mockResolvedValue(samplePost);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "" }),
			}),
			env,
		);

		expect(res.status).toBe(400);
	});

	it("returns 400 when body exceeds 1000 characters", async () => {
		mockGetPost.mockResolvedValue(samplePost);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "x".repeat(1001) }),
			}),
			env,
		);

		expect(res.status).toBe(400);
	});
});

describe("GET /api/app/posts/:postId/comments", () => {
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

	it("returns comments for a post", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockListComments.mockResolvedValue([
			{
				id: "c-1",
				postId: "post-1",
				authorId: "u1",
				body: "Pierwszy",
				parentId: null,
				createdAt: now,
				updatedAt: now,
				author: { id: "u1", name: "Tomek" },
				replies: [],
			},
		]);

		const api = createApi();
		const res = await api.request("/api/app/posts/post-1/comments", authedRequest("/"), env);

		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: unknown[] };
		expect(json.data).toHaveLength(1);
	});

	it("returns 404 when post does not exist", async () => {
		mockGetPost.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request("/api/app/posts/non-existent/comments", authedRequest("/"), env);

		expect(res.status).toBe(404);
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request("/api/app/posts/post-1/comments", {}, env);

		expect(res.status).toBe(401);
	});
});

describe("PATCH /api/app/posts/:postId/comments/:commentId", () => {
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

	it("allows author to edit their own comment", async () => {
		mockGetComment.mockResolvedValue(sampleComment);
		mockUpdateBody.mockResolvedValue({ ...sampleComment, body: "Zmieniony" });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1",
			authedRequest("/", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Zmieniony" }),
			}),
			env,
		);

		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { body: string } };
		expect(json.data.body).toBe("Zmieniony");
	});

	it("allows admin to edit any comment", async () => {
		mockVerify.mockResolvedValue({ userId: "u2", name: "Admin", role: "admin" });
		mockFindUser.mockResolvedValue({
			id: "u2",
			name: "Admin",
			role: "admin",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
		mockGetComment.mockResolvedValue(sampleComment);
		mockUpdateBody.mockResolvedValue({ ...sampleComment, body: "Admin edit" });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1",
			authedRequest("/", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Admin edit" }),
			}),
			env,
		);

		expect(res.status).toBe(200);
	});

	it("returns 403 for non-author non-admin member", async () => {
		mockVerify.mockResolvedValue({ userId: "u2", name: "Kasia", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u2",
			name: "Kasia",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
		mockGetComment.mockResolvedValue(sampleComment);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1",
			authedRequest("/", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Hack" }),
			}),
			env,
		);

		expect(res.status).toBe(403);
		expect(mockUpdateBody).not.toHaveBeenCalled();
	});

	it("returns 404 for non-existent comment", async () => {
		mockGetComment.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/non-existent",
			authedRequest("/", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Test" }),
			}),
			env,
		);

		expect(res.status).toBe(404);
	});

	it("returns 400 when body exceeds 1000 characters", async () => {
		mockGetComment.mockResolvedValue(sampleComment);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1",
			authedRequest("/", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "x".repeat(1001) }),
			}),
			env,
		);

		expect(res.status).toBe(400);
	});
});

describe("DELETE /api/app/posts/:postId/comments/:commentId", () => {
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

	it("allows author to delete their own comment", async () => {
		mockGetComment.mockResolvedValue(sampleComment);
		mockSoftDelete.mockResolvedValue({ ...sampleComment, deletedAt: now });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1",
			authedRequest("/", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
		expect(mockSoftDelete).toHaveBeenCalledWith("comment-1");
	});

	it("allows admin to delete any comment", async () => {
		mockVerify.mockResolvedValue({ userId: "u2", name: "Admin", role: "admin" });
		mockFindUser.mockResolvedValue({
			id: "u2",
			name: "Admin",
			role: "admin",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
		mockGetComment.mockResolvedValue(sampleComment);
		mockSoftDelete.mockResolvedValue({ ...sampleComment, deletedAt: now });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1",
			authedRequest("/", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(200);
	});

	it("returns 403 for non-author non-admin member", async () => {
		mockVerify.mockResolvedValue({ userId: "u2", name: "Kasia", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u2",
			name: "Kasia",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
		mockGetComment.mockResolvedValue(sampleComment);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1",
			authedRequest("/", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(403);
		expect(mockSoftDelete).not.toHaveBeenCalled();
	});

	it("returns 404 for non-existent comment", async () => {
		mockGetComment.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/non-existent",
			authedRequest("/", { method: "DELETE" }),
			env,
		);

		expect(res.status).toBe(404);
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1",
			{ method: "DELETE" },
			env,
		);

		expect(res.status).toBe(401);
	});
});

describe("POST /api/app/posts/:postId/comments/:commentId/replies", () => {
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

	it("creates reply with valid input", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockGetComment.mockResolvedValue(sampleComment);
		mockCountReplies.mockResolvedValue(0);
		mockCreateReply.mockResolvedValue({
			...sampleComment,
			id: "reply-1",
			parentId: "comment-1",
			body: "Odpowiedź!",
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1/replies",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Odpowiedź!" }),
			}),
			env,
		);

		expect(res.status).toBe(201);
		const json = (await res.json()) as { data: { id: string; parentId: string } };
		expect(json.data.id).toBe("reply-1");
		expect(json.data.parentId).toBe("comment-1");
		expect(mockCreateReply).toHaveBeenCalledWith({
			postId: "post-1",
			parentId: "comment-1",
			authorId: "u1",
			body: "Odpowiedź!",
		});
	});

	it("returns 404 when post does not exist", async () => {
		mockGetPost.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/non-existent/comments/comment-1/replies",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Odpowiedź!" }),
			}),
			env,
		);

		expect(res.status).toBe(404);
		expect(mockCreateReply).not.toHaveBeenCalled();
	});

	it("returns 404 when parent comment does not exist", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockGetComment.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/non-existent/replies",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Odpowiedź!" }),
			}),
			env,
		);

		expect(res.status).toBe(404);
		expect(mockCreateReply).not.toHaveBeenCalled();
	});

	it("returns 404 when parent comment belongs to a different post", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockGetComment.mockResolvedValue({ ...sampleComment, postId: "other-post" });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1/replies",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Odpowiedź!" }),
			}),
			env,
		);

		expect(res.status).toBe(404);
		expect(mockCreateReply).not.toHaveBeenCalled();
	});

	it("returns 422 when replying to a reply (reply-on-reply forbidden)", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockGetComment.mockResolvedValue({ ...sampleComment, parentId: "grandparent-1" });
		mockCountReplies.mockResolvedValue(0);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1/replies",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Odpowiedź!" }),
			}),
			env,
		);

		expect(res.status).toBe(422);
		expect(mockCreateReply).not.toHaveBeenCalled();
	});

	it("returns 422 when reply limit (5) is reached", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockGetComment.mockResolvedValue(sampleComment);
		mockCountReplies.mockResolvedValue(5);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1/replies",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Odpowiedź!" }),
			}),
			env,
		);

		expect(res.status).toBe(422);
		expect(mockCreateReply).not.toHaveBeenCalled();
	});

	it("returns 400 when body is empty", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockGetComment.mockResolvedValue(sampleComment);
		mockCountReplies.mockResolvedValue(0);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1/replies",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "" }),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateReply).not.toHaveBeenCalled();
	});

	it("returns 401 without session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1/replies",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Odpowiedź!" }),
			},
			env,
		);

		expect(res.status).toBe(401);
	});
});

describe("POST /api/app/posts/:postId/comments — mentions", () => {
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

	it("registers dropdown mentions with the new comment id", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockCreateComment.mockResolvedValue(sampleComment);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					body: "Hej @Ania",
					mentions: [
						{ userId: "u-ania", name: "Ania" },
						{ userId: "u-andrzej", name: "Andrzej" },
					],
				}),
			}),
			env,
		);

		expect(res.status).toBe(201);
		expect(mockCreateMentions).toHaveBeenCalledWith({
			postId: "post-1",
			commentId: "comment-1",
			userIds: ["u-ania", "u-andrzej"],
		});
	});

	it("registers nothing when no mentions are provided (manual @imię → no push)", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockCreateComment.mockResolvedValue(sampleComment);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "Hej @Ania wpisana z palca" }),
			}),
			env,
		);

		expect(res.status).toBe(201);
		expect(mockCreateMentions).not.toHaveBeenCalled();
	});

	it("rejects mention with empty userId via schema validation", async () => {
		mockGetPost.mockResolvedValue(samplePost);

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					body: "Hej",
					mentions: [{ userId: "", name: "Ania" }],
				}),
			}),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateMentions).not.toHaveBeenCalled();
	});
});

describe("POST /api/app/posts/:postId/comments/:commentId/replies — mentions", () => {
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

	it("registers dropdown mentions with the new reply id", async () => {
		mockGetPost.mockResolvedValue(samplePost);
		mockGetComment.mockResolvedValue(sampleComment);
		mockCountReplies.mockResolvedValue(0);
		mockCreateReply.mockResolvedValue({ ...sampleComment, id: "reply-1", parentId: "comment-1" });

		const api = createApi();
		const res = await api.request(
			"/api/app/posts/post-1/comments/comment-1/replies",
			authedRequest("/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					body: "Odp @Ania",
					mentions: [{ userId: "u-ania", name: "Ania" }],
				}),
			}),
			env,
		);

		expect(res.status).toBe(201);
		expect(mockCreateMentions).toHaveBeenCalledWith({
			postId: "post-1",
			commentId: "reply-1",
			userIds: ["u-ania"],
		});
	});
});
