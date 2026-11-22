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
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { loadAppBootstrap, useAppBootstrap } from "@/core/app-bootstrap";
import { BootSplash } from "@/core/boot-splash";

export const Route = createFileRoute("/app")({
	// Bootstrap (sesja/maintenance) get-or-fetch z query cache: sieć tylko
	// przy pierwszym wejściu, każda kolejna nawigacja czyta cache (microtask).
	beforeLoad: async ({ context }) => loadAppBootstrap(context),
	// Layout /app nigdy nie jest zastępowany pendingem — ładowanie podstron
	// pokazuje się w <Outlet> (obszar treści), nawigacja zostaje interaktywna.
	pendingMs: Number.POSITIVE_INFINITY,
	component: AppLayout,
});

function AppLayout() {
	const navigate = useNavigate();
	const { session, maintenance, isPending } = useAppBootstrap();

	// Live redirect: background refresh wykrył wygasłą sesję w trakcie sesji.
	useEffect(() => {
		if (!isPending && session === null) {
			void navigate({ to: "/", replace: true });
		}
	}, [isPending, session, navigate]);

	if (isPending || !session || !maintenance) {
		return <ScreenSkeleton />;
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
		<>
			{/* Splash (reviza): montowany w /app — sesja SSR zna imię usera, więc
			    splash od pierwszej klatki z „Witaj <name>"; znika w chwili hydratacji
			    (SPLASH_MIN_MS = 0). Ekran Loadera niżej to ścieżka bez SSR-cache. */}
			<BootSplash name={session.name} />
			<PwaShell>
				<DesktopSidebar role={session.role} />
				<main className="sm:ml-[240px]">
					<Outlet />
				</main>
				<MobileNav role={session.role} />
			</PwaShell>
		</>
	);
}
