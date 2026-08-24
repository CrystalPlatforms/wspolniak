// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
	createMember: vi.fn(),
	listActiveMembers: vi.fn(),
	regenerateMemberToken: vi.fn(),
	softDeleteMember: vi.fn(),
	updateMemberName: vi.fn(),
}));

vi.mock("@/db/instance/queries", () => ({
	getFeatureFlags: vi.fn(),
	getMaintenanceConfig: vi.fn(),
	updateFeatureFlags: vi.fn(),
	updateMaintenance: vi.fn(),
}));

vi.mock("@/db/stats", () => ({
	getStatsSummary: vi.fn(),
}));

vi.mock("@/db/upload-failures", () => ({
	listRecentUploadFailures: vi.fn(),
}));

import {
	createMember,
	findActiveUserById,
	listActiveMembers,
	regenerateMemberToken,
	softDeleteMember,
	updateMemberName,
} from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import {
	getFeatureFlags,
	getMaintenanceConfig,
	updateFeatureFlags,
	updateMaintenance,
} from "@/db/instance/queries";
import { getStatsSummary } from "@/db/stats";
import { listRecentUploadFailures } from "@/db/upload-failures";
import adminEndpoint from "./admin";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockCreateMember = vi.mocked(createMember);
const mockListActiveMembers = vi.mocked(listActiveMembers);
const mockRegenerateMemberToken = vi.mocked(regenerateMemberToken);
const mockSoftDeleteMember = vi.mocked(softDeleteMember);
const mockUpdateMemberName = vi.mocked(updateMemberName);
const mockGetMaintenanceConfig = vi.mocked(getMaintenanceConfig);
const mockUpdateMaintenance = vi.mocked(updateMaintenance);
const mockGetFeatureFlags = vi.mocked(getFeatureFlags);
const mockUpdateFeatureFlags = vi.mocked(updateFeatureFlags);
const mockGetStatsSummary = vi.mocked(getStatsSummary);
const mockListRecentUploadFailures = vi.mocked(listRecentUploadFailures);

function createApi() {
	const api = new Hono<{ Bindings: { SESSION_SECRET: string } }>().basePath("/api");
	api.route("/admin", adminEndpoint);
	return api;
}

function adminHeaders() {
	return { Cookie: "session=valid-jwt" };
}

beforeEach(() => {
	vi.clearAllMocks();
	mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "admin" });
	mockFindUser.mockResolvedValue({
		id: "u1",
		name: "Tomek",
		role: "admin",
		tokenHash: "hash",
		deletedAt: null,
		createdAt: new Date(),
	});
});

describe("POST /api/admin/members", () => {
	it("creates a member and returns the magic link", async () => {
		mockCreateMember.mockResolvedValue({
			user: {
				id: "m1",
				name: "Kasia",
				role: "member",
				tokenHash: "hash",
				deletedAt: null,
				createdAt: new Date(),
			},
			plaintextToken: "raw-token",
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/members",
			{
				method: "POST",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Kasia" }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			data: { user: { id: string; name: string }; magicLink: string };
		};
		expect(body.data.user.name).toBe("Kasia");
		expect(body.data.magicLink).toContain("raw-token");
		expect(mockCreateMember).toHaveBeenCalledWith("Kasia");
	});

	it("returns 400 when name is missing", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/members",
			{
				method: "POST",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({}),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
	});
});

describe("GET /api/admin/members", () => {
	it("returns list of active members", async () => {
		const members = [
			{
				id: "u1",
				name: "Tomek",
				role: "admin",
				tokenHash: "h1",
				deletedAt: null,
				createdAt: new Date(),
			},
			{
				id: "u2",
				name: "Kasia",
				role: "member",
				tokenHash: "h2",
				deletedAt: null,
				createdAt: new Date(),
			},
		];
		mockListActiveMembers.mockResolvedValue(members);

		const api = createApi();
		const res = await api.request(
			"/api/admin/members",
			{ headers: adminHeaders() },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { id: string; name: string; role: string }[] };
		expect(body.data).toHaveLength(2);
		expect(body.data[0]?.name).toBe("Tomek");
	});
});

describe("POST /api/admin/members/:id/regenerate", () => {
	it("regenerates token and returns new magic link", async () => {
		mockRegenerateMemberToken.mockResolvedValue({ plaintextToken: "new-token" });

		const api = createApi();
		const res = await api.request(
			"/api/admin/members/m1/regenerate",
			{
				method: "POST",
				headers: adminHeaders(),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { magicLink: string } };
		expect(body.data.magicLink).toContain("new-token");
		expect(mockRegenerateMemberToken).toHaveBeenCalledWith("m1");
	});
});

describe("DELETE /api/admin/members/:id", () => {
	it("soft-deletes a member", async () => {
		mockSoftDeleteMember.mockResolvedValue(undefined);

		const api = createApi();
		const res = await api.request(
			"/api/admin/members/m1",
			{
				method: "DELETE",
				headers: adminHeaders(),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { deleted: boolean } };
		expect(body.data.deleted).toBe(true);
		expect(mockSoftDeleteMember).toHaveBeenCalledWith("m1");
	});
});

describe("PATCH /api/admin/members/:id", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "admin" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "admin",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
	});

	it("renames a member and returns the new name", async () => {
		mockUpdateMemberName.mockResolvedValue({
			id: "m1",
			name: "Kasia-Nowa",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/members/m1",
			{
				method: "PATCH",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Kasia-Nowa" }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { id: string; name: string } };
		expect(body.data).toEqual({ id: "m1", name: "Kasia-Nowa" });
		expect(mockUpdateMemberName).toHaveBeenCalledWith("m1", "Kasia-Nowa");
	});

	it("returns 400 when name is empty", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/members/m1",
			{
				method: "PATCH",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ name: "" }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
		expect(mockUpdateMemberName).not.toHaveBeenCalled();
	});

	it("returns 400 when name is missing", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/members/m1",
			{
				method: "PATCH",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({}),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
		expect(mockUpdateMemberName).not.toHaveBeenCalled();
	});

	it("returns 400 when name is longer than 30 characters", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/members/m1",
			{
				method: "PATCH",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ name: "a".repeat(31) }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
		expect(mockUpdateMemberName).not.toHaveBeenCalled();
	});

	it("accepts a name of exactly 30 characters", async () => {
		const exact = "a".repeat(30);
		mockUpdateMemberName.mockResolvedValue({
			id: "m1",
			name: exact,
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/members/m1",
			{
				method: "PATCH",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ name: exact }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		expect(mockUpdateMemberName).toHaveBeenCalledWith("m1", exact);
	});

	it("trims surrounding whitespace from the name", async () => {
		mockUpdateMemberName.mockResolvedValue({
			id: "m1",
			name: "Kasia",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/members/m1",
			{
				method: "PATCH",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ name: "  Kasia  " }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		expect(mockUpdateMemberName).toHaveBeenCalledWith("m1", "Kasia");
	});

	it("returns 403 for a non-admin member", async () => {
		mockVerify.mockResolvedValue({ userId: "u2", name: "Kasia", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u2",
			name: "Kasia",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/members/m1",
			{
				method: "PATCH",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Kasia" }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(403);
		expect(mockUpdateMemberName).not.toHaveBeenCalled();
	});
});

describe("admin authorization", () => {
	it("returns 403 for non-admin member on all admin endpoints", async () => {
		mockVerify.mockResolvedValue({ userId: "u2", name: "Kasia", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u2",
			name: "Kasia",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/members",
			{ headers: adminHeaders() },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Forbidden");
	});
});

describe("GET /api/admin/maintenance", () => {
	it("returns current maintenance config", async () => {
		mockGetMaintenanceConfig.mockResolvedValue({
			enabled: true,
			message: "Naprawa",
			subtitle: "Wróć",
			icon: "wrench",
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/maintenance",
			{ headers: adminHeaders() },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			data: { enabled: boolean; message: string; subtitle: string; icon: string };
		};
		expect(body.data).toEqual({
			enabled: true,
			message: "Naprawa",
			subtitle: "Wróć",
			icon: "wrench",
		});
	});
});

describe("PUT /api/admin/maintenance", () => {
	it("updates all fields and returns the new config", async () => {
		mockGetMaintenanceConfig.mockResolvedValue({
			enabled: true,
			message: "X",
			subtitle: "Y",
			icon: "wrench",
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/maintenance",
			{
				method: "PUT",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ enabled: true, message: "X", subtitle: "Y", icon: "wrench" }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		expect(mockUpdateMaintenance).toHaveBeenCalledWith({
			enabled: true,
			message: "X",
			subtitle: "Y",
			icon: "wrench",
		});
	});

	it("trims and forwards partial update (only enabled)", async () => {
		mockGetMaintenanceConfig.mockResolvedValue({
			enabled: true,
			message: "Wspólniak jest w trakcie naprawy",
			subtitle: "Wróć za chwilę",
			icon: "alert-triangle",
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/maintenance",
			{
				method: "PUT",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ enabled: true }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		expect(mockUpdateMaintenance).toHaveBeenCalledWith({ enabled: true });
	});

	it("rejects message longer than 200 characters", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/maintenance",
			{
				method: "PUT",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ message: "a".repeat(201) }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
		expect(mockUpdateMaintenance).not.toHaveBeenCalled();
	});

	it("rejects subtitle longer than 100 characters", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/maintenance",
			{
				method: "PUT",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ subtitle: "a".repeat(101) }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
	});

	it("rejects icon longer than 50 characters", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/maintenance",
			{
				method: "PUT",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ icon: "a".repeat(51) }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
	});
});

describe("GET /api/admin/stats", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "admin" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "admin",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
	});

	it("returns the stats summary", async () => {
		const summary = {
			dau: 3,
			wau: 5,
			photosLast7Days: 12,
			pushDeliveryLast7Days: { attempts: 10, successes: 8, rate: 0.8 },
			totalPosts: 150,
			totalComments: 800,
			totalPhotos: 320,
			totalReactions: 1240,
			totalMentions: 95,
			windowStart: "2026-06-30T12:00:00.000Z",
			windowEnd: "2026-07-07T12:00:00.000Z",
		};
		mockGetStatsSummary.mockResolvedValue(summary);

		const api = createApi();
		const res = await api.request(
			"/api/admin/stats",
			{ headers: adminHeaders() },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: typeof summary };
		expect(body.data).toEqual(summary);
	});

	it("returns 403 for a non-admin member", async () => {
		mockVerify.mockResolvedValue({ userId: "u2", name: "Kasia", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u2",
			name: "Kasia",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/stats",
			{ headers: adminHeaders() },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(403);
	});
});

describe("GET /api/admin/features", () => {
	it("returns current feature flags", async () => {
		mockGetFeatureFlags.mockResolvedValue({
			video: true,
			markdown: false,
			library: true,
			chat: true,
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/features",
			{ headers: adminHeaders() },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			data: { video: boolean; markdown: boolean; library: boolean };
		};
		expect(body.data).toEqual({ video: true, markdown: false, library: true, chat: true });
	});
});

describe("PUT /api/admin/features", () => {
	it("updates both flags and returns the new state", async () => {
		mockGetFeatureFlags.mockResolvedValue({
			video: false,
			markdown: false,
			library: false,
			chat: false,
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/features",
			{
				method: "PUT",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ video: false, markdown: false, library: false, chat: false }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		expect(mockUpdateFeatureFlags).toHaveBeenCalledWith({
			video: false,
			markdown: false,
			library: false,
			chat: false,
		});
	});

	it("forwards a partial update (only video)", async () => {
		mockGetFeatureFlags.mockResolvedValue({
			video: false,
			markdown: true,
			library: true,
			chat: true,
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/features",
			{
				method: "PUT",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ video: false }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		expect(mockUpdateFeatureFlags).toHaveBeenCalledWith({ video: false });
	});

	it("rejects non-boolean video", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/features",
			{
				method: "PUT",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ video: "yes" }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
		expect(mockUpdateFeatureFlags).not.toHaveBeenCalled();
	});

	it("rejects non-boolean markdown", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/features",
			{
				method: "PUT",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ markdown: 1 }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
		expect(mockUpdateFeatureFlags).not.toHaveBeenCalled();
	});

	it("rejects non-boolean library", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/features",
			{
				method: "PUT",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ library: "yes" }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
		expect(mockUpdateFeatureFlags).not.toHaveBeenCalled();
	});

	// F8 #159: czwarta flaga — chat, ta sama walidacja co pozostałe.
	it("rejects non-boolean chat", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/features",
			{
				method: "PUT",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ chat: "yes" }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
		expect(mockUpdateFeatureFlags).not.toHaveBeenCalled();
	});
});

describe("GET /api/admin/upload-failures", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "admin" });
		mockFindUser.mockResolvedValue({
			id: "u1",
			name: "Tomek",
			role: "admin",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});
	});

	it("returns recent upload failures for the admin panel", async () => {
		mockListRecentUploadFailures.mockResolvedValue([
			{
				id: "failure-1",
				userId: "u2",
				step: "image-upload",
				kind: "timeout",
				detail: "TimeoutError: aborted",
				fileName: "duze.jpg",
				fileSize: 4096,
				createdAt: new Date("2026-08-17T10:00:00Z"),
			},
		]);

		const api = createApi();
		const res = await api.request(
			"/api/admin/upload-failures",
			{ headers: adminHeaders() },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Array<{ id: string; kind: string }> };
		expect(body.data).toHaveLength(1);
		expect(body.data[0]?.kind).toBe("timeout");
		expect(mockListRecentUploadFailures).toHaveBeenCalledWith(50);
	});

	it("returns 403 for a non-admin member", async () => {
		mockVerify.mockResolvedValue({ userId: "u2", name: "Kasia", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u2",
			name: "Kasia",
			role: "member",
			tokenHash: "hash",
			deletedAt: null,
			createdAt: new Date(),
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/upload-failures",
			{ headers: adminHeaders() },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(403);
	});
});
