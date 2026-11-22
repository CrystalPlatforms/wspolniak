// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	IconBookmark,
	IconBookmarkFilled,
	IconCalendar,
	IconCalendarFilled,
	IconChartPie3,
	IconChartPie3Filled,
	IconHome,
	IconHomeFilled,
	IconMenu2,
	IconPhoto,
	IconPhotoFilled,
	IconPhotoPlus,
	IconPlus,
	IconSearch,
	IconSearchFilled,
} from "@tabler/icons-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAlbumsNewDot } from "@/core/albums-seen";
import { cn } from "@/lib/utils";

interface NavItem {
	to: string;
	icon: React.ComponentType<{ className?: string; fill?: string }>;
	label: string;
	exact?: boolean;
	adminOnly?: boolean;
	/** Wariant wypełniony (kategoria Filled Tablera) — renderowany gdy pozycja aktywna. */
	iconActive?: React.ComponentType<{ className?: string }>;
}

// Mirror desktop-sidebar.tsx NAV_ITEMS — jedno źródło prawdy dla nawigacji.
const NAV_ITEMS: NavItem[] = [
	// Aktywna pozycja ma wariant Filled (reviza usera: wypełnione ikony nawigacji).
	{ to: "/app", icon: IconHome, iconActive: IconHomeFilled, label: "Feed", exact: true },
	{ to: "/app/lib", icon: IconBookmark, iconActive: IconBookmarkFilled, label: "Biblioteka" },
	// Albumy (#170): mirror desktop-sidebar; brak flagi w F1 — zawsze widoczna,
	{ to: "/app/albums", icon: IconPhoto, iconActive: IconPhotoFilled, label: "Albumy" },
	// Admin wyjęty z menu (przebudowa 2026-09-01) — wejście tylko z Ustawień.
	{
		to: "/app/calendar",
		icon: IconCalendar,
		iconActive: IconCalendarFilled,
		label: "Kalendarz",
		adminOnly: false,
	},
	// Wyszukiwarka: pełne szukanie po archiwum (posty, komentarze, albumy).
	{ to: "/app/search", icon: IconSearch, iconActive: IconSearchFilled, label: "Wyszukiwarka" },
	{
		to: "/app/stats",
		icon: IconChartPie3,
		iconActive: IconChartPie3Filled,
		label: "Statystyki",
		adminOnly: false,
	},
	// Ustawienia przeniesione do nagłówka feeda (ikona Cog obok „Witaj", reviza usera).
];

interface MobileSidebarProps {
	role?: string;
}

/** Widoczność pozycji menu: rola admina (flagi On/Off usunięte — wszystko włączone). */
function isNavItemVisible(item: NavItem, role: string | undefined): boolean {
	if (item.adminOnly && role !== "admin") return false;
	return true;
}

// Hamburger (tylko mobile, sm:hidden) otwierający drawer animowany od lewej.
// Zawiera wszystkie pozycje jak desktop-sidebar + Nowy post.
export function MobileSidebar({ role }: MobileSidebarProps) {
	const [open, setOpen] = useState(false);
	const { pathname } = useLocation();
	const { resolvedTheme } = useTheme();
	const items = NAV_ITEMS.filter((item) => isNavItemVisible(item, role));

	// Kropka „new" przy „Albumy" (#176): najnowszy album vs timestamp widzianych.
	const hasNewAlbums = useAlbumsNewDot();
	const logoSrc =
		resolvedTheme === "dark"
			? "/logos/WspolniakLogoTrans.png"
			: "/logos/WspolniakLogoTransLIGHT.png";

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<button
					type="button"
					aria-label="Otwórz menu"
					className="rounded-md p-2 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:hidden"
				>
					<IconMenu2 className="h-12 w-12" aria-hidden="true" />
				</button>
			</SheetTrigger>
			<SheetContent side="left" hideClose className="w-[260px] gap-0 p-0 sm:max-w-[260px]">
				<SheetHeader className="border-b border-border">
					<SheetTitle className="sr-only">Wspólniak</SheetTitle>
					<img src={logoSrc} alt="Wspólniak" className="mx-auto h-32 w-auto" />
				</SheetHeader>

				<nav className="flex flex-1 flex-col gap-1 p-4">
					{items.map((item) => {
						const isActive = item.exact ? pathname === item.to : pathname.startsWith(item.to);
						const Icon = item.icon;
						return (
							<Link
								key={item.to}
								to={item.to}
								onClick={() => setOpen(false)}
								className={cn(
									"flex items-center gap-3 rounded-full px-3 py-3 text-lg font-medium transition-colors",
									isActive
										? "font-bold text-foreground"
										: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
								)}
							>
								{isActive && item.iconActive ? (
									<item.iconActive className="size-6 shrink-0" />
								) : (
									<Icon className="size-6 shrink-0" fill="none" />
								)}
								<span>{item.label}</span>
								{item.to === "/app/albums" && hasNewAlbums && (
									<span aria-hidden="true" className="ml-auto size-2 rounded-full bg-primary" />
								)}
							</Link>
						);
					})}
				</nav>

				<div className="flex flex-col gap-2 border-t border-border p-4">
					<Link to="/app/new-album" onClick={() => setOpen(false)}>
						<Button variant="secondary" className="w-full rounded-full py-4 text-lg font-bold">
							<IconPhotoPlus className="mr-2 size-6" aria-hidden="true" />
							Nowy album
						</Button>
					</Link>
					<Link to="/app/new" onClick={() => setOpen(false)}>
						<Button className="w-full rounded-full py-4 text-lg font-bold">
							<IconPlus className="mr-2 size-6" aria-hidden="true" />
							Nowy post
						</Button>
					</Link>
				</div>
			</SheetContent>
		</Sheet>
	);
}
