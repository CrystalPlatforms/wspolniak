// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link, useLocation } from "@tanstack/react-router";
import { Home, Plus, RefreshCw } from "lucide-react";
import { MobileSidebar } from "@/components/app/mobile-sidebar";
import { Button } from "@/components/ui/button";
import { useBootReveal } from "@/core/boot-splash";
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from "@/db/instance";
import { cn } from "@/lib/utils";

interface MobileNavProps {
	role?: string;
	featureFlags?: FeatureFlags;
}

export function MobileNav({ role, featureFlags = DEFAULT_FEATURE_FLAGS }: MobileNavProps) {
	const { pathname } = useLocation();
	const bootRevealed = useBootReveal();
	const isHomeActive = pathname === "/app";

	return (
		<nav
			className={cn(
				"fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background pb-safe sm:hidden",
				bootRevealed && "boot-reveal-up",
			)}
		>
			<div className="flex items-center justify-around px-2 py-3">
				<MobileSidebar role={role} featureFlags={featureFlags} />

				<Link
					to="/app"
					className={cn(
						"flex flex-col items-center gap-1.5 rounded-md p-1.5",
						isHomeActive && "font-bold",
					)}
				>
					<Home className="h-6 w-6 text-foreground" />
					<span className="text-xs text-muted-foreground">Home</span>
				</Link>

				<Link to="/app/new" className="flex flex-col items-center gap-1.5">
					<Button size="lg" className="h-14 w-14 rounded-full px-0">
						<Plus className="h-6 w-6" />
					</Button>
					<span className="text-xs text-muted-foreground">Dodaj</span>
				</Link>

				<button
					type="button"
					onClick={() => window.location.reload()}
					className="flex flex-col items-center gap-1.5 rounded-md p-1.5"
					aria-label="Odśwież"
				>
					<RefreshCw className="h-6 w-6 text-foreground" />
					<span className="text-xs text-muted-foreground">Odśwież</span>
				</button>
			</div>
		</nav>
	);
}
