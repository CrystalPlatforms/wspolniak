// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	findActiveUserById,
	listActiveMembers,
	regenerateMemberToken,
} from "@/db/identity/queries";
import { getShareCode } from "@/db/instance/queries";
import { createHono } from "@/hono/factory";
import { createRateLimiter } from "@/hono/middleware/rate-limit";

// #166 + rewizja usera (2026-08-24): stały kod admina 1219 WRACA (decyzja
// właściciela instancji) — verify raportuje isAdmin, login regeneruje token
// admina. Osłoną przed brute-force pozostają wiadra rate-limitera 5/min/IP
// na verify i login (to one trzymają #29/#30 w ryzach przy krótszych kodach).
const ADMIN_SHARE_CODE = "1219";
const SHARE_RATE_LIMIT = { windowMs: 60_000, max: 5 } as const;
const verifyLimiter = createRateLimiter(SHARE_RATE_LIMIT);
const loginLimiter = createRateLimiter(SHARE_RATE_LIMIT);

const shareEndpoint = createHono();

shareEndpoint.post("/verify", verifyLimiter, async (c) => {
	const body = await c.req.json<{ code?: string }>();

	if (body.code === ADMIN_SHARE_CODE) {
		return c.json({ isAdmin: true });
	}

	const storedCode = await getShareCode();
	if (!storedCode || body.code !== storedCode) {
		return c.json({ error: "Invalid code" }, 401);
	}

	const members = await listActiveMembers();
	const memberList = members
		.filter((m) => m.role === "member")
		.map((m) => ({ id: m.id, name: m.name }));

	return c.json({ members: memberList, isAdmin: false });
});

shareEndpoint.post("/login", loginLimiter, async (c) => {
	const body = await c.req.json<{ code?: string; memberId?: string }>();

	if (body.code === ADMIN_SHARE_CODE) {
		const members = await listActiveMembers();
		const admin = members.find((m) => m.role === "admin");
		if (!admin) {
			return c.json({ error: "Admin not found" }, 404);
		}
		const { plaintextToken } = await regenerateMemberToken(admin.id);
		return c.json({ redirectUrl: `/app/u/${plaintextToken}` });
	}

	const storedCode = await getShareCode();
	if (!storedCode || body.code !== storedCode) {
		return c.json({ error: "Invalid code" }, 401);
	}

	const user = await findActiveUserById(body.memberId ?? "");
	if (!user) {
		return c.json({ error: "Member not found" }, 404);
	}

	if (user.role !== "member") {
		return c.json({ error: "Forbidden" }, 403);
	}

	const { plaintextToken } = await regenerateMemberToken(user.id);
	return c.json({ redirectUrl: `/app/u/${plaintextToken}` });
});

export default shareEndpoint;
