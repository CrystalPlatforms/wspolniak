// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServerFn } from "@tanstack/react-start";
import { getFeatureFlags } from "@/db/instance/queries";

export const getFeatureFlagsState = createServerFn({ method: "GET" }).handler(async () => {
	return getFeatureFlags();
});
