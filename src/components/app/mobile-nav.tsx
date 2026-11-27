// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	IconHome,
	IconHomeFilled,
	IconPhoto,
	IconPhotoFilled,
	IconPlus,
} from "@tabler/icons-react";
import { Link, useLocation } from "@tanstack/react-router";
import { MobileSidebar } from "@/components/app/mobile-sidebar";
import { Button } from "@/components/ui/button";
import { useBootReveal } from "@/core/boot-splash";
import { cn } from "@/lib/utils";

interface MobileNavProps {
	role?: string;
}

/**
 * Etykieta pozycji paska: niewidoczna pogrubiona kopia tekstu rezerwuje
 * szerokość, więc podświetlenie aktywnej pozycji (font-bold dziedziczone
 * z Linka) nie zmienia szerokości etykiety i nie rozsuwa sąsiednich
 * przycisków przy justify-around.
 */
function NavLabel({ label }: { label: string }) {
	return (
		<span className="grid justify-items-center text-xs text-muted-foreground">
			<span aria-hidden="true" className="invisible col-start-1 row-start-1 font-bold">
				{label}
			</span>
			<span className="col-start-1 row-start-1">{label}</span>
		</span>
	);
}

/**
 * Dolny pasek mobile (reviza #245): hamburger, Feed, Dodaj i Albumy — Albumy
 * zajęły miejsce po czacie. Aktywna pozycja ma wariant Filled (jak w sidebarze).
 */
export function MobileNav({ role }: MobileNavProps) {
	const { pathname } = useLocation();
	const bootRevealed = useBootReveal();
	const isHomeActive = pathname === "/app";
	const isAlbumsActive = pathname.startsWith("/app/albums");

	return (
		<nav
			className={cn(
				"fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background pb-safe sm:hidden",
				bootRevealed && "boot-reveal-up",
			)}
		>
			<div className="flex items-center justify-around px-2 py-3">
				<MobileSidebar role={role} />

				<Link
					to="/app"
					className={cn(
						"flex flex-col items-center gap-1.5 rounded-md p-1.5",
						isHomeActive && "font-bold",
					)}
				>
					{isHomeActive ? (
						<IconHomeFilled className="h-6 w-6 text-foreground" aria-hidden="true" />
					) : (
						<IconHome className="h-6 w-6 text-foreground" aria-hidden="true" />
					)}
					<NavLabel label="Feed" />
				</Link>

				<Link to="/app/new" className="flex flex-col items-center gap-1.5">
					<Button size="lg" className="h-14 w-14 rounded-full px-0">
						{/* size-* omija nadpisanie [&_svg]:size-4 z Buttona (h-12 nie działało). */}
						<IconPlus className="size-12" aria-hidden="true" />
					</Button>
					<NavLabel label="Dodaj" />
				</Link>

				<Link
					to="/app/albums"
					className={cn(
						"flex flex-col items-center gap-1.5 rounded-md p-1.5",
						isAlbumsActive && "font-bold",
					)}
				>
					{isAlbumsActive ? (
						<IconPhotoFilled className="h-6 w-6 text-foreground" aria-hidden="true" />
					) : (
						<IconPhoto className="h-6 w-6 text-foreground" aria-hidden="true" />
					)}
					<NavLabel label="Albumy" />
				</Link>
			</div>
		</nav>
	);
}
