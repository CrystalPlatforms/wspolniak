// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { DesktopSidebar } from "@/components/app/desktop-sidebar";
import { MobileNav } from "@/components/app/mobile-nav";
import {
	MaintenanceOverlay,
	shouldShowMaintenanceOverlay,
} from "@/components/maintenance/maintenance-overlay";
import { PwaShell } from "@/components/pwa/pwa-shell";
import { getFeatureFlagsState } from "@/core/functions/feature-flags";
import { getMaintenanceState } from "@/core/functions/maintenance";
import { getSession } from "@/core/functions/session";

export const Route = createFileRoute("/app")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/" });
		}
		const maintenance = await getMaintenanceState();
		const featureFlags = await getFeatureFlagsState();
		return { session, maintenance, featureFlags };
	},
	component: AppLayout,
});

function AppLayout() {
	const { session, maintenance, featureFlags } = Route.useRouteContext();

	if (shouldShowMaintenanceOverlay(maintenance, session.role)) {
		return (
			<MaintenanceOverlay
				message={maintenance.message}
				subtitle={maintenance.subtitle}
				icon={maintenance.icon}
			/>
		);
	}

	return (
		<PwaShell>
			<DesktopSidebar role={session.role} featureFlags={featureFlags} />
			<main className="sm:ml-[240px]">
				<Outlet />
			</main>
			<MobileNav role={session.role} featureFlags={featureFlags} />
		</PwaShell>
	);
}
