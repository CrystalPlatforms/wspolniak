// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
}));

vi.mock("@/db/calendar", () => ({
	listCalendarEvents: vi.fn(),
}));

import { listCalendarEvents } from "@/db/calendar";
import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import calendarAppEndpoint from "./calendar-app";

/**
 * Założenia (#163 Kalendarz v2): GET /api/app/calendar dostępny dla każdego
 * zalogowanego członka (widok kalendarza), CRUD zostaje wyłącznie adminowy
 * na /api/admin/calendar. Tu istnieje TYLKO GET — mutacje 404.
 */
const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockList = vi.mocked(listCalendarEvents);

function createApi() {
	return new Hono<{ Bindings: { SESSION_SECRET: string } }>()
		.basePath("/api")
		.route("/app/calendar", calendarAppEndpoint);
}

beforeEach(() => {
	vi.clearAllMocks();
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
});

describe("GET /api/app/calendar", () => {
	it("returns the events for a regular member", async () => {
		const now = new Date();
		mockList.mockResolvedValue([
			{
				id: "e1",
				title: "Urodziny",
				description: null,
				day: 15,
				month: 3,
				createdAt: now,
				updatedAt: now,
			},
		]);

		const res = await createApi().request(
			"/api/app/calendar",
			{ headers: { Cookie: "session=valid-jwt" } },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { id: string; title: string }[] };
		expect(body.data).toHaveLength(1);
		expect(body.data[0]?.title).toBe("Urodziny");
		expect(mockList).toHaveBeenCalledTimes(1);
	});

	it("returns 401 without a session", async () => {
		mockVerify.mockResolvedValue(null);

		const res = await createApi().request("/api/app/calendar", {}, { SESSION_SECRET: "secret" });

		expect(res.status).toBe(401);
		expect(mockList).not.toHaveBeenCalled();
	});
});

describe("mutacje poza GET", () => {
	it("does not expose POST on the app endpoint (CRUD stays admin-only)", async () => {
		const res = await createApi().request(
			"/api/app/calendar",
			{
				method: "POST",
				headers: { Cookie: "session=valid-jwt", "Content-Type": "application/json" },
				body: JSON.stringify({ title: "X", day: 1, month: 1 }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(404);
	});
});
