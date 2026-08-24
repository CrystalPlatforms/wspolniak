// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import setupRoute from "./setup";

vi.mock("@/db/instance/queries", () => ({
	isSetupCompleted: vi.fn(),
	completeSetup: vi.fn(),
}));

vi.mock("@/db/identity/queries", () => ({
	createUser: vi.fn(),
}));

vi.mock("@/db/identity/crypto", () => ({
	generateToken: vi.fn(),
}));

import { generateToken } from "@/db/identity/crypto";
import { createUser } from "@/db/identity/queries";
import { completeSetup, isSetupCompleted } from "@/db/instance/queries";

const mockIsSetupCompleted = vi.mocked(isSetupCompleted);
const mockCompleteSetup = vi.mocked(completeSetup);
const mockCreateUser = vi.mocked(createUser);
const mockGenerateToken = vi.mocked(generateToken);

function createApp() {
	const app = new Hono();
	app.route("/api/setup", setupRoute);
	return app;
}

function postSetup(app: Hono, body: unknown) {
	return app.request("/api/setup", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("POST /api/setup", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns magic link on fresh instance", async () => {
		mockIsSetupCompleted.mockResolvedValue(false);
		mockGenerateToken.mockResolvedValue({
			plaintext: "test-token-abc",
			hash: "hashed-token",
		});
		mockCompleteSetup.mockResolvedValue({
			id: "cfg-1",
			familyName: "Kowalscy",
			setupCompleted: true,
			shareCode: null,
			createdAt: new Date(),
			maintenanceMode: false,
			maintenanceMessage: null,
			maintenanceSubtitle: null,
			maintenanceIcon: null,
			videoEnabled: true,
			markdownEnabled: true,
			libraryEnabled: true,
			chatEnabled: true,
			youtubeChannelId: null,
			youtubeChannelTitle: null,
			youtubeRefreshToken: null,
			youtubeConnectedAt: null,
			youtubeConnectedBy: null,
		});
		mockCreateUser.mockResolvedValue({
			id: "user-1",
			name: "Tomek",
			role: "admin",
			tokenHash: "hashed-token",
			deletedAt: null,
			createdAt: new Date(),
		});

		const app = createApp();
		const res = await postSetup(app, {
			familyName: "Kowalscy",
			adminName: "Tomek",
		});

		expect(res.status).toBe(200);
		const json = (await res.json()) as { magicLink: string };
		expect(json.magicLink).toContain("/app/u/test-token-abc");

		expect(mockCompleteSetup).toHaveBeenCalledWith("Kowalscy");
		expect(mockCreateUser).toHaveBeenCalledWith({
			name: "Tomek",
			role: "admin",
			tokenHash: "hashed-token",
		});
	});

	it("returns 404 when instance is already set up", async () => {
		mockIsSetupCompleted.mockResolvedValue(true);

		const app = createApp();
		const res = await postSetup(app, {
			familyName: "Kowalscy",
			adminName: "Tomek",
		});

		expect(res.status).toBe(404);
		const body = await res.text();
		expect(body).toBe("");
		expect(mockCompleteSetup).not.toHaveBeenCalled();
		expect(mockCreateUser).not.toHaveBeenCalled();
	});

	it("returns 400 for missing familyName", async () => {
		mockIsSetupCompleted.mockResolvedValue(false);

		const app = createApp();
		const res = await postSetup(app, { adminName: "Tomek" });

		expect(res.status).toBe(400);
		const json = (await res.json()) as { error: string };
		expect(json.error).toBeDefined();
	});

	it("returns 400 for missing adminName", async () => {
		mockIsSetupCompleted.mockResolvedValue(false);

		const app = createApp();
		const res = await postSetup(app, { familyName: "Kowalscy" });

		expect(res.status).toBe(400);
	});

	it("returns 400 for empty strings", async () => {
		mockIsSetupCompleted.mockResolvedValue(false);

		const app = createApp();
		const res = await postSetup(app, { familyName: "", adminName: "" });

		expect(res.status).toBe(400);
	});
});
