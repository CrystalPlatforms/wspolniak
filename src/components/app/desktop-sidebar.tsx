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
	IconPhoto,
	IconPhotoFilled,
	IconPhotoPlus,
	IconPlus,
	IconSearch,
	IconSearchFilled,
} from "@tabler/icons-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { useAlbumsNewDot } from "@/core/albums-seen";
import { useBootReveal } from "@/core/boot-splash";
import { cn } from "@/lib/utils";

interface NavItem {
	to: string;
	icon: React.ComponentType<{ className?: string; fill?: string }>;
	/** Wariant wypełniony (kategoria Filled Tablera) — renderowany gdy pozycja aktywna. */
	iconActive?: React.ComponentType<{ className?: string }>;
	label: string;
	exact?: boolean;
	adminOnly?: boolean;
}

interface DesktopSidebarProps {
	role?: string;
}

const NAV_ITEMS: NavItem[] = [
	// Aktywna pozycja ma wariant Filled (reviza usera: wypełnione ikony w sidebarze).
	{ to: "/app", icon: IconHome, iconActive: IconHomeFilled, label: "Feed", exact: true },
	{ to: "/app/lib", icon: IconBookmark, iconActive: IconBookmarkFilled, label: "Biblioteka" },
	// Albumy (#170): sekcja zbiorów rodzinnych; aktywna = wypełniona ramka zdjęcia.
	{ to: "/app/albums", icon: IconPhoto, iconActive: IconPhotoFilled, label: "Albumy" },
	{
		to: "/app/calendar",
		icon: IconCalendar,
		iconActive: IconCalendarFilled,
		label: "Kalendarz",
		adminOnly: false,
	},
	// Wyszukiwarka: pełne szukanie po archiwum (posty, komentarze, albumy).
	{ to: "/app/search", icon: IconSearch, iconActive: IconSearchFilled, label: "Wyszukiwarka" },
	// Statystyki: ChartBar nie ma wariantu Filled — glyph podmieniony na ChartPie (reviza usera).
	{
		to: "/app/stats",
		icon: IconChartPie3,
		iconActive: IconChartPie3Filled,
		label: "Statystyki",
		adminOnly: false,
	},
	// Ustawienia przeniesione do nagłówka feeda (ikona Cog obok „Witaj", reviza usera).
];

export function DesktopSidebar({ role }: DesktopSidebarProps) {
	const location = useLocation();
	const { resolvedTheme } = useTheme();

	const items = NAV_ITEMS;

	// Kropka „new" przy „Albumy" (#176): najnowszy album vs timestamp widzianych.
	const hasNewAlbums = useAlbumsNewDot();

	const logoSrc =
		resolvedTheme === "dark"
			? "/logos/WspolniakLogoTrans.webp"
			: "/logos/WspolniakLogoTransLIGHT.webp";

	const bootRevealed = useBootReveal();

	return (
		<aside
			className={cn(
				"hidden sm:flex sm:flex-col sm:fixed sm:left-0 sm:top-0 sm:bottom-0 sm:w-[220px] sm:bg-background sm:px-4 sm:py-4",
				bootRevealed && "boot-reveal-side",
			)}
		>
			<img src={logoSrc} alt="Wspólniak" className="mx-auto mb-6 h-48 w-auto" />

			<nav className="flex flex-1 flex-col gap-1 pl-2">
				{items.map((item) => {
					if ("adminOnly" in item && item.adminOnly && role !== "admin") return null;

					const isActive = item.exact
						? location.pathname === item.to
						: location.pathname.startsWith(item.to);
					const Icon = item.icon;

					return (
						<Link
							key={item.to}
							to={item.to}
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

			<div className="mt-6 flex flex-col gap-2 px-3">
				<Link to="/app/new-album">
					<Button variant="secondary" className="w-full rounded-full py-4 text-lg font-bold">
						<IconPhotoPlus className="mr-2 size-6" aria-hidden="true" />
						Nowy album
					</Button>
				</Link>
				<Link to="/app/new">
					<Button className="w-full rounded-full py-4 text-lg font-bold">
						<IconPlus className="mr-2 size-6" aria-hidden="true" />
						Nowy post
					</Button>
				</Link>
			</div>
		</aside>
	);
}
