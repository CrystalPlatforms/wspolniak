// SPDX-License-Identifier: AGPL-3.0-or-later

import { listMembersForMentions } from "@/db/identity/queries";
import { getLeaderboard, type LeaderboardCategory } from "@/db/stats";
import { insertUploadFailure, reportUploadFailureSchema } from "@/db/upload-failures";
import { createHono, getOrigin } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";

const appEndpoint = createHono();

appEndpoint.use("*", authMiddleware());

appEndpoint.get("/me", (c) => {
	const user = c.get("user");
	return c.json({ data: user });
});

appEndpoint.get("/config", (c) => {
	return c.json({ data: { appUrl: getOrigin(c) } });
});

appEndpoint.get("/users", async (c) => {
	const members = await listMembersForMentions(c.req.query("q"));
	return c.json({ data: members });
});

const LEADERBOARD_CATEGORIES: readonly LeaderboardCategory[] = [
	"posts",
	"comments",
	"photos",
	"reactions",
	"mentions-received",
	"mentions-made",
];

// Publiczny ranking dla wszystkich zalogowanych — jedna odpowiedź ze wszystkimi
// 6 kategoriami (1 fetch). limit domyślnie 3, max 20 (obrona przed nadużyciem).
appEndpoint.get("/stats/leaderboard", async (c) => {
	const parsed = Number(c.req.query("limit"));
	const limit = Number.isFinite(parsed) && parsed > 0 && parsed <= 20 ? Math.floor(parsed) : 3;
	const entries = await Promise.all(
		LEADERBOARD_CATEGORIES.map(
			async (category) => [category, await getLeaderboard(category, limit)] as const,
		),
	);
	return c.json({ data: Object.fromEntries(entries) });
});

// POST /upload-failures — best-effort raport klienta o nieudanym uploadzie zdjęć
// (issue #135). userId zawsze z sesji — klient nie może raportować za kogoś innego.
appEndpoint.post("/upload-failures", async (c) => {
	const parsed = reportUploadFailureSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Invalid report" }, 400);
	}

	const user = c.get("user");
	const failure = await insertUploadFailure({ userId: user.userId, ...parsed.data });
	return c.json({ data: failure }, 201);
});

export default appEndpoint;
