// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { DesktopSidebar } from "@/components/app/desktop-sidebar";
import { MobileNav } from "@/components/app/mobile-nav";
import {
	MaintenanceOverlay,
	shouldShowMaintenanceOverlay,
} from "@/components/maintenance/maintenance-overlay";
import { PwaShell } from "@/components/pwa/pwa-shell";
import { Loader } from "@/components/ui/loader";
import { useAiAccess } from "@/core/ai/use-ai-access";
import { loadAppBootstrap, useAppBootstrap } from "@/core/app-bootstrap";

export const Route = createFileRoute("/app")({
	// Bootstrap (sesja/maintenance/flagi) get-or-fetch z query cache: sieć tylko
	// przy pierwszym wejściu, każda kolejna nawigacja czyta cache (microtask).
	beforeLoad: async ({ context }) => loadAppBootstrap(context),
	// Layout /app nigdy nie jest zastępowany pendingem — ładowanie podstron
	// pokazuje się w <Outlet> (obszar treści), nawigacja zostaje interaktywna.
	pendingMs: Number.POSITIVE_INFINITY,
	component: AppLayout,
});

function AppLayout() {
	const navigate = useNavigate();
	const { session, maintenance, featureFlags, isPending } = useAppBootstrap();
	// Wejścia do czatu AL (F6 #184) — skuteczny dostęp steruje widocznością.
	const aiAccess = useAiAccess();
	const aiEntrance = aiAccess.data?.effective === true;

	// Live redirect: background refresh wykrył wygasłą sesję w trakcie sesji.
	useEffect(() => {
		if (!isPending && session === null) {
			void navigate({ to: "/", replace: true });
		}
	}, [isPending, session, navigate]);

	if (isPending || !session || !maintenance || !featureFlags) {
		return (
			<div className="flex min-h-dvh items-center justify-center bg-background">
				<Loader size={10} />
			</div>
		);
	}

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
			<DesktopSidebar role={session.role} featureFlags={featureFlags} aiEntrance={aiEntrance} />
			<main className="sm:ml-[240px]">
				<Outlet />
			</main>
			<MobileNav role={session.role} featureFlags={featureFlags} aiEntrance={aiEntrance} />
		</PwaShell>
	);
}
