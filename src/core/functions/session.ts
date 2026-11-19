// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServerFn } from "@tanstack/react-start";

/**
 * Import auth (drizzle pośrednio) wewnątrz handlera — stub server-fn bez kodu
 * serwerowego w bundle kliencie (issue #239; szczegóły w feature-flags.ts).
 */
export const getSession = createServerFn({ method: "GET" }).handler(async () => {
	const [{ env }, { getSessionUser }] = await Promise.all([
		import("cloudflare:workers"),
		import("@/core/middleware/auth"),
	]);
	return getSessionUser(env.SESSION_SECRET);
});
