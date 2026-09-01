// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import authRoute from "./auth";

vi.mock("@/db/identity/queries", () => ({
	findUserByTokenHash: vi.fn(),
}));

vi.mock("@/db/identity/session", () => ({
	createSessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

import { findUserByTokenHash } from "@/db/identity/queries";
import { createSessionCookie } from "@/db/identity/session";

const mockFindUser = vi.mocked(findUserByTokenHash);
const mockCreateSession = vi.mocked(createSessionCookie);

function createApp() {
	const app = new Hono<{ Bindings: { SESSION_SECRET: string } }>();
	app.route("/app/u", authRoute);
	return app;
}

describe("GET /app/u/:token", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("redirects to /app with session cookie for valid token", async () => {
		mockFindUser.mockResolvedValue({
			id: "user-1",
			name: "Tomek",
			role: "admin",
			tokenHash: "hashed",
			deletedAt: null,
			createdAt: new Date(),
			aiOptIn: false,
			aiBlocked: false,
		});
		mockCreateSession.mockResolvedValue("jwt-cookie-value");

		const app = createApp();
		const res = await app.request("/app/u/some-token", undefined, {
			SESSION_SECRET: "test-secret",
		});

		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/app");

		const setCookie = res.headers.get("Set-Cookie");
		expect(setCookie).toContain("session=jwt-cookie-value");
		expect(setCookie).toContain("HttpOnly");
		expect(setCookie).toContain("SameSite=Lax");
		expect(setCookie).toContain("Max-Age=31536000");
	});

	it("redirects to /auth/error for invalid token", async () => {
		mockFindUser.mockResolvedValue(null);

		const app = createApp();
		const res = await app.request("/app/u/bad-token", undefined, {
			SESSION_SECRET: "test-secret",
		});

		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/auth/error");
		expect(res.headers.get("Set-Cookie")).toBeNull();
	});
});
