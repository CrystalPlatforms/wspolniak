// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
}));

vi.mock("@/db/calendar", async () => {
	const actual =
		await vi.importActual<typeof import("@/db/calendar/schema")>("@/db/calendar/schema");
	return {
		createCalendarEvent: vi.fn(),
		listCalendarEvents: vi.fn(),
		createCalendarEventSchema: actual.createCalendarEventSchema,
		deleteCalendarEvent: vi.fn(),
		updateCalendarEvent: vi.fn(),
		updateCalendarEventSchema: actual.updateCalendarEventSchema,
	};
});

import {
	createCalendarEvent,
	deleteCalendarEvent,
	listCalendarEvents,
	updateCalendarEvent,
} from "@/db/calendar";
import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import calendarEndpoint from "./calendar";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockCreate = vi.mocked(createCalendarEvent);
const mockList = vi.mocked(listCalendarEvents);
const mockUpdate = vi.mocked(updateCalendarEvent);
const mockDelete = vi.mocked(deleteCalendarEvent);

function createApi() {
	return new Hono<{ Bindings: { SESSION_SECRET: string } }>()
		.basePath("/api")
		.route("/admin/calendar", calendarEndpoint);
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
		aiOptIn: false,
		aiBlocked: false,
	});
});

describe("GET /api/admin/calendar", () => {
	it("returns the list of events", async () => {
		const now = new Date();
		const events = [
			{
				id: "e1",
				title: "Urodziny",
				description: null,
				day: 15,
				month: 3,
				createdAt: now,
				updatedAt: now,
			},
		];
		mockList.mockResolvedValue(events);

		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar",
			{ headers: adminHeaders() },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { id: string; title: string }[] };
		expect(body.data).toHaveLength(1);
		expect(body.data[0]?.title).toBe("Urodziny");
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
			aiOptIn: false,
			aiBlocked: false,
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar",
			{ headers: adminHeaders() },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(403);
		expect(mockList).not.toHaveBeenCalled();
	});
});

describe("POST /api/admin/calendar", () => {
	it("creates an event and returns it", async () => {
		const now = new Date();
		const created = {
			id: "e1",
			title: "Urodziny",
			description: null,
			day: 15,
			month: 3,
			createdAt: now,
			updatedAt: now,
		};
		mockCreate.mockResolvedValue(created);

		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar",
			{
				method: "POST",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Urodziny", day: 15, month: 3 }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as { data: { id: string; title: string } };
		expect(body.data.title).toBe("Urodziny");
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({ title: "Urodziny", day: 15, month: 3 }),
		);
	});

	it("returns 400 when title is missing", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar",
			{
				method: "POST",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ day: 15, month: 3 }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("returns 400 when day is out of range (32)", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar",
			{
				method: "POST",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ title: "X", day: 32, month: 3 }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("returns 400 when month is out of range (13)", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar",
			{
				method: "POST",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ title: "X", day: 15, month: 13 }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
		expect(mockCreate).not.toHaveBeenCalled();
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
			aiOptIn: false,
			aiBlocked: false,
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar",
			{
				method: "POST",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ title: "X", day: 15, month: 3 }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(403);
		expect(mockCreate).not.toHaveBeenCalled();
	});
});

describe("PATCH /api/admin/calendar/:id", () => {
	it("updates the event and returns it", async () => {
		const now = new Date();
		const updated = {
			id: "e1",
			title: "Nowe imieniny",
			description: null,
			day: 20,
			month: 6,
			createdAt: now,
			updatedAt: now,
		};
		mockUpdate.mockResolvedValue(updated);

		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar/e1",
			{
				method: "PATCH",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Nowe imieniny", day: 20, month: 6 }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { id: string; title: string } };
		expect(body.data.title).toBe("Nowe imieniny");
		expect(mockUpdate).toHaveBeenCalledWith(
			"e1",
			expect.objectContaining({ title: "Nowe imieniny", day: 20, month: 6 }),
		);
	});

	it("returns 404 when the event does not exist", async () => {
		mockUpdate.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar/missing",
			{
				method: "PATCH",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ title: "X" }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(404);
	});

	it("returns 400 when day is out of range", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar/e1",
			{
				method: "PATCH",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ day: 32 }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(400);
		expect(mockUpdate).not.toHaveBeenCalled();
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
			aiOptIn: false,
			aiBlocked: false,
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar/e1",
			{
				method: "PATCH",
				headers: { ...adminHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ title: "X" }),
			},
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(403);
		expect(mockUpdate).not.toHaveBeenCalled();
	});
});

describe("DELETE /api/admin/calendar/:id", () => {
	it("deletes the event", async () => {
		const now = new Date();
		mockDelete.mockResolvedValue({
			id: "e1",
			title: "X",
			description: null,
			day: 1,
			month: 1,
			createdAt: now,
			updatedAt: now,
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar/e1",
			{ method: "DELETE", headers: adminHeaders() },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(200);
		expect(mockDelete).toHaveBeenCalledWith("e1");
	});

	it("returns 404 when the event does not exist", async () => {
		mockDelete.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar/missing",
			{ method: "DELETE", headers: adminHeaders() },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(404);
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
			aiOptIn: false,
			aiBlocked: false,
		});

		const api = createApi();
		const res = await api.request(
			"/api/admin/calendar/e1",
			{ method: "DELETE", headers: adminHeaders() },
			{ SESSION_SECRET: "secret" },
		);

		expect(res.status).toBe(403);
		expect(mockDelete).not.toHaveBeenCalled();
	});
});
