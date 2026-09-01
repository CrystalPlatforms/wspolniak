// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
}));

import { findActiveUserById } from "@/db/identity/queries";
import type { SessionPayload } from "@/db/identity/session";
import { verifySessionCookie } from "@/db/identity/session";
import { authMiddleware } from "./auth";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);

function createTestApp() {
	const app = new Hono<{
		Bindings: { SESSION_SECRET: string };
		Variables: { user: SessionPayload };
	}>();
	app.use("*", authMiddleware());
	app.get("/test", (c) => {
		const user = c.get("user");
		return c.json({ user });
	});
	return app;
}

const dbUser = {
	id: "u1",
	name: "Tomek",
	role: "admin",
	tokenHash: "hash",
	deletedAt: null,
	createdAt: new Date(),
	aiOptIn: false,
	aiBlocked: false,
};

describe("authMiddleware", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("sets user from database for valid session cookie", async () => {
		mockVerify.mockResolvedValue({ userId: "u1", name: "OldName", role: "member" });
		mockFindUser.mockResolvedValue(dbUser);

		const app = createTestApp();
		const res = await app.request(
			"/test",
			{
				headers: { Cookie: "session=valid-jwt-token" },
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { user: SessionPayload };
		expect(body.user).toEqual({ userId: "u1", name: "Tomek", role: "admin" });
		expect(mockVerify).toHaveBeenCalledWith("valid-jwt-token", "secret");
		expect(mockFindUser).toHaveBeenCalledWith("u1");
	});

	it("returns 401 when no cookie is present", async () => {
		const app = createTestApp();
		const res = await app.request("/test", {}, { SESSION_SECRET: "secret" });

		expect(res.status).toBe(401);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Unauthorized");
		expect(mockVerify).not.toHaveBeenCalled();
	});

	it("returns 401 when cookie is invalid or expired", async () => {
		mockVerify.mockResolvedValue(null);

		const app = createTestApp();
		const res = await app.request(
			"/test",
			{
				headers: { Cookie: "session=expired-or-tampered" },
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(401);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Unauthorized");
		expect(mockVerify).toHaveBeenCalledWith("expired-or-tampered", "secret");
	});

	it("returns 401 when user no longer exists in database", async () => {
		mockVerify.mockResolvedValue({ userId: "deleted-user", name: "Ghost", role: "member" });
		mockFindUser.mockResolvedValue(null);

		const app = createTestApp();
		const res = await app.request(
			"/test",
			{
				headers: { Cookie: "session=valid-but-deleted-user" },
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(401);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Unauthorized");
		expect(mockFindUser).toHaveBeenCalledWith("deleted-user");
	});
});
