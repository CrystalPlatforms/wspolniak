// SPDX-License-Identifier: AGPL-3.0-or-later
import { type QueryClient, queryOptions, useQuery } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { getMaintenanceState } from "@/core/functions/maintenance";
import { getSession } from "@/core/functions/session";
import type { SessionPayload } from "@/db/identity/session";
import type { MaintenanceConfig } from "@/db/instance";

/** Surowy stan bootstrapu z cache — sesja może być null (użytkownik wylogowany). */
export interface AppBootstrapData {
	session: SessionPayload | null;
	maintenance: MaintenanceConfig;
}

/** Context trasy /app — sesja gwarantowana przez redirect guard w loadAppBootstrap. */
export interface AppBootstrapContext {
	session: SessionPayload;
	maintenance: MaintenanceConfig;
}

export const appBootstrapKey = ["app-bootstrap"] as const;

/** Zgrane z serwerowym cache konfiguracji (60 s) — background refresh, nigdy blokujący. */
const APP_BOOTSTRAP_STALE_TIME = 60_000;

export function appBootstrapOptions() {
	return queryOptions({
		queryKey: appBootstrapKey,
		queryFn: async (): Promise<AppBootstrapData> => {
			const [session, maintenance] = await Promise.all([getSession(), getMaintenanceState()]);
			return { session, maintenance };
		},
		staleTime: APP_BOOTSTRAP_STALE_TIME,
	});
}

/**
 * beforeLoad trasy /app: get-or-fetch. Pusty cache → jednorazowy fetch (cold start);
 * dane w cache → zwrot z microtaska (zero sieci, zero pendingu).
 */
export async function loadAppBootstrap(context: {
	queryClient: QueryClient;
}): Promise<AppBootstrapContext> {
	const boot = await context.queryClient.ensureQueryData({
		...appBootstrapOptions(),
		revalidateIfStale: true,
	});
	if (!boot.session) {
		throw redirect({ to: "/" });
	}
	return {
		session: boot.session,
		maintenance: boot.maintenance,
	};
}

/**
 * Live odczyt bootstrapu w layoucie /app: dane z cache od razu, przeterminowane
 * wartości odświeżają się w tle (staleTime) — bez rośnięcia isPending.
 */
export function useAppBootstrap() {
	const { data, isPending } = useQuery(appBootstrapOptions());
	return {
		session: data?.session,
		maintenance: data?.maintenance,
		isPending,
	};
}
