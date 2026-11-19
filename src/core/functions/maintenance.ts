// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServerFn } from "@tanstack/react-start";

/**
 * Import modułu DB wewnątrz handlera (issue #239) — stub server-fn bez Neonu
 * w bundle klienta (szczegóły w core/functions/feature-flags.ts).
 */
export const getMaintenanceState = createServerFn({ method: "GET" }).handler(async () => {
	const { getMaintenanceConfig } = await import("@/db/instance/queries");
	return getMaintenanceConfig();
});
