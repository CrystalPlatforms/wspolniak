// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "@/core/errors";
import {
	createMember,
	listActiveMembers,
	regenerateMemberToken,
	softDeleteMember,
	updateMemberName,
} from "@/db/identity/queries";
import {
	getFeatureFlags,
	getMaintenanceConfig,
	getShareCode,
	setShareCode,
	updateFeatureFlags,
	updateMaintenance,
} from "@/db/instance/queries";
import { getStatsSummary } from "@/db/stats";
import { listRecentUploadFailures } from "@/db/upload-failures";
import { createHono, getOrigin } from "@/hono/factory";
import { adminMiddleware } from "@/hono/middleware/admin";
import { authMiddleware } from "@/hono/middleware/auth";

const adminEndpoint = createHono();

adminEndpoint.use("*", authMiddleware());
adminEndpoint.use("*", adminMiddleware());

adminEndpoint.post("/members", async (c) => {
	const body = await c.req.json<{ name?: string }>();
	const name = body.name?.trim();

	if (!name) {
		return c.json({ error: "Name is required" }, 400);
	}

	const { user, plaintextToken } = await createMember(name);
	const magicLink = `${getOrigin(c)}/app/u/${plaintextToken}`;

	return c.json(
		{ data: { user: { id: user.id, name: user.name, role: user.role }, magicLink } },
		201,
	);
});

adminEndpoint.get("/members", async (c) => {
	const members = await listActiveMembers();
	const data = members.map((m) => ({
		id: m.id,
		name: m.name,
		role: m.role,
		createdAt: m.createdAt,
	}));
	return c.json({ data });
});

adminEndpoint.post("/members/:id/regenerate", async (c) => {
	const userId = c.req.param("id");
	const { plaintextToken } = await regenerateMemberToken(userId);
	const magicLink = `${getOrigin(c)}/app/u/${plaintextToken}`;

	return c.json({ data: { magicLink } });
});

adminEndpoint.delete("/members/:id", async (c) => {
	const userId = c.req.param("id");
	await softDeleteMember(userId);
	return c.json({ data: { deleted: true } });
});

adminEndpoint.patch("/members/:id", async (c) => {
	const userId = c.req.param("id");
	const body = await c.req.json<{ name?: string }>();
	const name = body.name?.trim();

	if (!name) {
		return c.json({ error: "Name is required" }, 400);
	}

	if (name.length > 30) {
		return c.json({ error: "Name max 30 characters" }, 400);
	}

	const updated = await updateMemberName(userId, name);
	return c.json({ data: { id: updated.id, name: updated.name } });
});

// #166 — kod dostępu /share (dialog admina). Walidacja entropii (8–20 znaków)
// mieszka w setShareCode; AppError z niej mapujemy tutaj na 400.
adminEndpoint.get("/share-code", async (c) => {
	const code = await getShareCode();
	return c.json({ data: { code } });
});

adminEndpoint.put("/share-code", async (c) => {
	const body = await c.req.json<{ code?: string }>();
	const code = body.code?.trim();

	if (!code) return c.json({ error: "Code is required" }, 400);

	try {
		await setShareCode(code);
	} catch (error) {
		if (error instanceof AppError) {
			return c.json({ error: error.message }, error.status as ContentfulStatusCode);
		}
		throw error;
	}

	return c.json({ data: { code } });
});

adminEndpoint.get("/maintenance", async (c) => {
	const config = await getMaintenanceConfig();
	return c.json({ data: config });
});

adminEndpoint.put("/maintenance", async (c) => {
	const body = await c.req.json<{
		enabled?: boolean;
		message?: string;
		subtitle?: string;
		icon?: string;
	}>();

	const message = body.message?.trim();
	const subtitle = body.subtitle?.trim();
	const icon = body.icon?.trim();

	if (message !== undefined && message.length > 200) {
		return c.json({ error: "Message max 200 characters" }, 400);
	}
	if (subtitle !== undefined && subtitle.length > 100) {
		return c.json({ error: "Subtitle max 100 characters" }, 400);
	}
	if (icon !== undefined && icon.length > 50) {
		return c.json({ error: "Icon max 50 characters" }, 400);
	}

	const update: {
		enabled?: boolean;
		message?: string;
		subtitle?: string;
		icon?: string;
	} = {};
	if (typeof body.enabled === "boolean") update.enabled = body.enabled;
	if (message) update.message = message;
	if (subtitle) update.subtitle = subtitle;
	if (icon) update.icon = icon;

	await updateMaintenance(update);
	const config = await getMaintenanceConfig();
	return c.json({ data: config });
});

adminEndpoint.get("/features", async (c) => {
	const flags = await getFeatureFlags();
	return c.json({ data: flags });
});

adminEndpoint.put("/features", async (c) => {
	const body = await c.req.json<{
		video?: unknown;
		markdown?: unknown;
		library?: unknown;
		chat?: unknown;
		albums?: unknown;
	}>();

	const update: {
		video?: boolean;
		markdown?: boolean;
		library?: boolean;
		chat?: boolean;
		albums?: boolean;
	} = {};
	if (body.video !== undefined) {
		if (typeof body.video !== "boolean") {
			return c.json({ error: "video must be a boolean" }, 400);
		}
		update.video = body.video;
	}
	if (body.markdown !== undefined) {
		if (typeof body.markdown !== "boolean") {
			return c.json({ error: "markdown must be a boolean" }, 400);
		}
		update.markdown = body.markdown;
	}
	if (body.library !== undefined) {
		if (typeof body.library !== "boolean") {
			return c.json({ error: "library must be a boolean" }, 400);
		}
		update.library = body.library;
	}
	if (body.chat !== undefined) {
		if (typeof body.chat !== "boolean") {
			return c.json({ error: "chat must be a boolean" }, 400);
		}
		update.chat = body.chat;
	}
	if (body.albums !== undefined) {
		if (typeof body.albums !== "boolean") {
			return c.json({ error: "albums must be a boolean" }, 400);
		}
		update.albums = body.albums;
	}

	await updateFeatureFlags(update);
	const flags = await getFeatureFlags();
	return c.json({ data: flags });
});

adminEndpoint.get("/stats", async (c) => {
	const summary = await getStatsSummary(new Date());
	return c.json({ data: summary });
});

// GET /upload-failures — ostatnie nieudane uploady zdjęć (diagnostyka, issue #135).
adminEndpoint.get("/upload-failures", async (c) => {
	const failures = await listRecentUploadFailures(50);
	return c.json({ data: failures });
});

export default adminEndpoint;
