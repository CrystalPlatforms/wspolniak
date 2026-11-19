// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServerFn } from "@tanstack/react-start";

/**
 * Import modułu DB wewnątrz handlera (issue #239): stub server-fn wysyłany do
 * klienta nie może mieć top-level importów z drizzle/neon — TanStack wycina
 * ciało handlera ze stuba, ale importy top-level zostają i ciągną Neon do bundle'a.
 */
export const getFeatureFlagsState = createServerFn({ method: "GET" }).handler(async () => {
	const { getFeatureFlags } = await import("@/db/instance/queries");
	return getFeatureFlags();
});
