// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
	listMembersForMentions: vi.fn(),
}));

vi.mock("@/db/stats", () => ({
	getLeaderboard: vi.fn(),
}));

vi.mock("@/db/upload-failures", async (importOriginal) => ({
	// Schemat zod zostaje prawdziwy (używa go endpoint) — mockujemy tylko DB.
	...(await importOriginal<typeof import("@/db/upload-failures")>()),
	insertUploadFailure: vi.fn(),
}));

import { findActiveUserById, listMembersForMentions } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import { getLeaderboard } from "@/db/stats";
import { insertUploadFailure } from "@/db/upload-failures";
import appEndpoint from "./app";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockListMembers = vi.mocked(listMembersForMentions);
const mockGetLeaderboard = vi.mocked(getLeaderboard);
const mockInsertUploadFailure = vi.mocked(insertUploadFailure);

function createApi() {
	const api = new Hono<{ Bindings: { SESSION_SECRET: string } }>().basePath("/api");
	api.route("/app", appEndpoint);
	return api;
}

describe("GET /api/app/me", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns user data with valid session", async () => {
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "admin" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "admin",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/me",
			{
				headers: { Cookie: "session=valid-jwt" },
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { userId: string; name: string; role: string } };
		expect(body.data).toEqual({ userId: "u1", name: "Tomek", role: "admin" });
	});

	it("returns 401 without session cookie", async () => {
		const api = createApi();
		const res = await api.request("/api/app/me", {}, { SESSION_SECRET: "secret" });

		expect(res.status).toBe(401);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Unauthorized");
	});
});

describe("GET /api/app/users", () => {
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

	it("returns active members filtered by ?q=", async () => {
		mockListMembers.mockResolvedValue([
			{ id: "u2", name: "Ania" },
			{ id: "u3", name: "Andrzej" },
		]);

		const api = createApi();
		const res = await api.request(
			"/api/app/users?q=an",
			{ headers: { Cookie: "session=valid-jwt" } },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Array<{ id: string; name: string }> };
		expect(body.data).toEqual([
			{ id: "u2", name: "Ania" },
			{ id: "u3", name: "Andrzej" },
		]);
		expect(mockListMembers).toHaveBeenCalledWith("an");
	});

	it("returns 401 without session cookie", async () => {
		const api = createApi();
		const res = await api.request("/api/app/users", {}, { SESSION_SECRET: "secret" });

		expect(res.status).toBe(401);
	});
});

describe("GET /api/app/stats/leaderboard", () => {
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

	it("returns all six category leaderboards for a logged-in member", async () => {
		mockGetLeaderboard.mockResolvedValue([{ name: "Tomek", count: 9 }]);

		const api = createApi();
		const res = await api.request(
			"/api/app/stats/leaderboard?limit=3",
			{ headers: { Cookie: "session=valid-jwt" } },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			data: Record<string, Array<{ name: string; count: number }>>;
		};
		expect(Object.keys(body.data).sort()).toEqual([
			"comments",
			"mentions-made",
			"mentions-received",
			"photos",
			"posts",
			"reactions",
		]);
		expect(body.data.posts).toEqual([{ name: "Tomek", count: 9 }]);
		expect(mockGetLeaderboard).toHaveBeenCalledWith("posts", 3);
	});

	it("returns 401 without session cookie", async () => {
		const api = createApi();
		const res = await api.request("/api/app/stats/leaderboard", {}, { SESSION_SECRET: "secret" });

		expect(res.status).toBe(401);
	});
});

describe("POST /api/app/upload-failures", () => {
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

	it("reports a failed upload with userId taken from the session", async () => {
		mockInsertUploadFailure.mockResolvedValue({
			id: "failure-1",
			userId: "u1",
			step: "image-upload",
			kind: "network",
			detail: "TypeError: Load failed",
			fileName: "wakacje.jpg",
			fileSize: 2048,
			createdAt: new Date(),
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/upload-failures",
			{
				method: "POST",
				headers: { Cookie: "session=valid-jwt", "Content-Type": "application/json" },
				body: JSON.stringify({
					step: "image-upload",
					kind: "network",
					detail: "TypeError: Load failed",
					fileName: "wakacje.jpg",
					fileSize: 2048,
				}),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(201);
		expect(mockInsertUploadFailure).toHaveBeenCalledWith({
			userId: "u1",
			step: "image-upload",
			kind: "network",
			detail: "TypeError: Load failed",
			fileName: "wakacje.jpg",
			fileSize: 2048,
		});
	});

	it("rejects an invalid body with 400", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/app/upload-failures",
			{
				method: "POST",
				headers: { Cookie: "session=valid-jwt", "Content-Type": "application/json" },
				body: JSON.stringify({ step: "nieznany-krok", kind: "network" }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
		expect(mockInsertUploadFailure).not.toHaveBeenCalled();
	});

	it("returns 401 without session cookie", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/app/upload-failures",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ step: "compress", kind: "unknown" }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(401);
	});
});
