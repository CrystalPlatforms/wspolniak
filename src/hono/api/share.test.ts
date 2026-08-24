// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu API /share (#166):
// - POST /verify: poprawny kod → lista AKTYWNYCH członków o roli "member"
//   (admin nigdy nie trafia do listy); zły kod / kod nieustawiony → 401.
// - POST /login: poprawny kod + memberId → redirectUrl /app/u/{token}
//   (regeneracja tokenu); nieznany/usunięty członek → 404; rola ≠ member → 403
//   (admin loguje się wyłącznie przez CLI — #29/#30).
// - ŻADEN specjalny kod (np. dawne "1219") nie istnieje: traktowany jak zły.
// - Rate limit 5/min/IP, osobne wiadra na /verify i /login (middleware realny,
//   nie mockowany) — po wyczerpaniu 429 {error}.
vi.mock("@/db/instance/queries", () => ({
	getShareCode: vi.fn(),
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
	listActiveMembers: vi.fn(),
	regenerateMemberToken: vi.fn(),
}));

import { Hono } from "hono";
import {
	findActiveUserById,
	listActiveMembers,
	regenerateMemberToken,
} from "@/db/identity/queries";
import { getShareCode } from "@/db/instance/queries";
import shareEndpoint from "./share";

const mockGetShareCode = vi.mocked(getShareCode);
const mockListActiveMembers = vi.mocked(listActiveMembers);
const mockFindActiveUserById = vi.mocked(findActiveUserById);
const mockRegenerateMemberToken = vi.mocked(regenerateMemberToken);

/** Każdy test dostaje własne IP — wiadra rate-limitera nie przeciekają między testami. */
let ipCounter = 0;

function uniqueIp(): string {
	ipCounter += 1;
	return `10.0.0.${ipCounter}`;
}

function postJson(path: string, payload: unknown, ip = uniqueIp()) {
	return createApi().request(path, {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
		body: JSON.stringify(payload),
	});
}

function createApi() {
	const api = new Hono().basePath("/api");
	api.route("/share", shareEndpoint);
	return api;
}

const memberUser = {
	id: "u2",
	name: "Kasia",
	role: "member",
	tokenHash: "h2",
	deletedAt: null,
	createdAt: new Date(),
};

const adminUser = {
	id: "u1",
	name: "Tomek",
	role: "admin",
	tokenHash: "h1",
	deletedAt: null,
	createdAt: new Date(),
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("POST /api/share/verify", () => {
	it("returns member list (admins filtered out, isAdmin false) when code matches", async () => {
		mockGetShareCode.mockResolvedValue("4827");
		mockListActiveMembers.mockResolvedValue([adminUser, memberUser]);

		const res = await postJson("/api/share/verify", { code: "4827" });

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			members: { id: string; name: string }[];
			isAdmin: boolean;
		};
		expect(body.members).toHaveLength(1);
		expect(body.members[0]?.id).toBe("u2");
		expect(body.members[0]?.name).toBe("Kasia");
		expect(body.isAdmin).toBe(false);
	});

	it("returns 401 when code does not match", async () => {
		mockGetShareCode.mockResolvedValue("4827");

		const res = await postJson("/api/share/verify", { code: "9999" });

		expect(res.status).toBe(401);
	});

	it("returns 401 when share code is not set (null)", async () => {
		mockGetShareCode.mockResolvedValue(null);

		const res = await postJson("/api/share/verify", { code: "4827" });

		expect(res.status).toBe(401);
	});

	it("returns isAdmin=true for the admin code 1219 (rewizja usera)", async () => {
		mockGetShareCode.mockResolvedValue("4827");

		const res = await postJson("/api/share/verify", { code: "1219" });

		expect(res.status).toBe(200);
		const body = (await res.json()) as { isAdmin: boolean };
		expect(body.isAdmin).toBe(true);
	});
});

describe("POST /api/share/login", () => {
	it("returns redirect URL for valid code and member", async () => {
		mockGetShareCode.mockResolvedValue("4827");
		mockFindActiveUserById.mockResolvedValue(memberUser);
		mockRegenerateMemberToken.mockResolvedValue({ plaintextToken: "new-token" });

		const res = await postJson("/api/share/login", { code: "4827", memberId: "u2" });

		expect(res.status).toBe(200);
		const body = (await res.json()) as { redirectUrl: string };
		expect(body.redirectUrl).toBe("/app/u/new-token");
		expect(mockRegenerateMemberToken).toHaveBeenCalledWith("u2");
	});

	it("admin code 1219 logs in the admin (regenerates admin token)", async () => {
		mockGetShareCode.mockResolvedValue("4827");
		mockListActiveMembers.mockResolvedValue([adminUser, memberUser]);
		mockRegenerateMemberToken.mockResolvedValue({ plaintextToken: "admin-token" });

		const res = await postJson("/api/share/login", { code: "1219", memberId: "" });

		expect(res.status).toBe(200);
		const body = (await res.json()) as { redirectUrl: string };
		expect(body.redirectUrl).toBe("/app/u/admin-token");
		expect(mockRegenerateMemberToken).toHaveBeenCalledWith("u1");
	});

	it("admin code returns 404 when no admin exists", async () => {
		mockGetShareCode.mockResolvedValue("4827");
		mockListActiveMembers.mockResolvedValue([memberUser]);

		const res = await postJson("/api/share/login", { code: "1219", memberId: "" });

		expect(res.status).toBe(404);
	});

	it("returns 401 when code does not match (no token regeneration)", async () => {
		mockGetShareCode.mockResolvedValue("4827");

		const res = await postJson("/api/share/login", { code: "9999", memberId: "u2" });

		expect(res.status).toBe(401);
		expect(mockRegenerateMemberToken).not.toHaveBeenCalled();
	});

	it("returns 404 when member is unknown or deleted", async () => {
		mockGetShareCode.mockResolvedValue("4827");
		mockFindActiveUserById.mockResolvedValue(null);

		const res = await postJson("/api/share/login", { code: "4827", memberId: "ghost" });

		expect(res.status).toBe(404);
	});

	it("returns 403 for a non-member role (admin via CLI only)", async () => {
		mockGetShareCode.mockResolvedValue("4827");
		mockFindActiveUserById.mockResolvedValue(adminUser);

		const res = await postJson("/api/share/login", { code: "4827", memberId: "u1" });

		expect(res.status).toBe(403);
		expect(mockRegenerateMemberToken).not.toHaveBeenCalled();
	});
});

describe("rate limiting (#166 hardening)", () => {
	it("blocks the 6th verify attempt from one IP within a minute with 429", async () => {
		mockGetShareCode.mockResolvedValue("4827");
		const ip = "9.9.9.9";

		// 5 prób mieści się w limicie (odpowiedzi 401 — zły kod, ale przepuszczone).
		for (let i = 0; i < 5; i++) {
			const res = await postJson("/api/share/verify", { code: "nope" }, ip);
			expect(res.status).toBe(401);
		}

		const sixth = await postJson("/api/share/verify", { code: "4827" }, ip);
		expect(sixth.status).toBe(429);
		const body = (await sixth.json()) as { error: string };
		expect(body.error).toBe("Too many requests");

		// Inne IP nie jest blokowane — a poprawny kod działa.
		mockListActiveMembers.mockResolvedValue([memberUser]);
		const otherIp = await postJson("/api/share/verify", { code: "4827" }, "8.8.8.8");
		expect(otherIp.status).toBe(200);
	});

	it("keeps verify and login buckets independent (5 verifies do not block login)", async () => {
		mockGetShareCode.mockResolvedValue("4827");
		const ip = "7.7.7.7";

		for (let i = 0; i < 5; i++) {
			await postJson("/api/share/verify", { code: "nope" }, ip);
		}

		mockFindActiveUserById.mockResolvedValue(memberUser);
		mockRegenerateMemberToken.mockResolvedValue({ plaintextToken: "t" });
		const login = await postJson("/api/share/login", { code: "4827", memberId: "u2" }, ip);
		expect(login.status).toBe(200);
	});
});
