// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	IconBookmark,
	IconCalendar,
	IconChartBar,
	IconHome,
	IconMenu2,
	IconMessage,
	IconPhoto,
	IconPhotoPlus,
	IconPlus,
	IconSearch,
} from "@tabler/icons-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAlbumsNewDot } from "@/core/albums-seen";
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from "@/db/instance";
import { cn } from "@/lib/utils";

interface NavItem {
	to: string;
	icon: React.ComponentType<{ className?: string; fill?: string }>;
	label: string;
	exact?: boolean;
	adminOnly?: boolean;
	/** Wypełnij ikonę (fill) gdy pozycja jest aktywna — np. zakładka w Bibliotece. */
	fillWhenActive?: boolean;
}

// Mirror desktop-sidebar.tsx NAV_ITEMS — jedno źródło prawdy dla nawigacji.
const NAV_ITEMS: NavItem[] = [
	{ to: "/app", icon: IconHome, label: "Feed", exact: true },
	{ to: "/app/lib", icon: IconBookmark, label: "Biblioteka", fillWhenActive: true },
	// Albumy (#170): mirror desktop-sidebar; brak flagi w F1 — zawsze widoczna,
	// bez fillWhenActive (wypełniona ikona IconPhoto wygląda źle — reviza usera).
	{ to: "/app/albums", icon: IconPhoto, label: "Albumy" },
	// F8 #159: nazwa usera „Chat" (nie „Czat"); wypełniona gdy aktywna.
	{ to: "/app/chat", icon: IconMessage, label: "Chat", fillWhenActive: true },
	// Admin wyjęty z menu (przebudowa 2026-09-01) — wejście tylko z Ustawień.
	{
		to: "/app/calendar",
		icon: IconCalendar,
		label: "Kalendarz",
		adminOnly: false,
		fillWhenActive: true,
	},
	// Wyszukiwarka: pełne szukanie po archiwum (posty, komentarze, albumy).
	{ to: "/app/search", icon: IconSearch, label: "Wyszukiwarka" },
	{ to: "/app/stats", icon: IconChartBar, label: "Statystyki", adminOnly: false },
	// Ustawienia przeniesione do nagłówka feeda (ikona Cog obok „Witaj", reviza usera).
];

interface MobileSidebarProps {
	role?: string;
	featureFlags?: FeatureFlags;
}

/** Widoczność pozycji menu: flagi funkcji + rola admina. */
function isNavItemVisible(
	item: NavItem,
	{ role, featureFlags }: { role?: string; featureFlags: FeatureFlags },
): boolean {
	if (item.adminOnly && role !== "admin") return false;
	if (item.to === "/app/lib" && !featureFlags.library) return false;
	if (item.to === "/app/chat" && !featureFlags.chat) return false;
	if (item.to === "/app/albums" && !featureFlags.albums) return false;
	return true;
}

// Hamburger (tylko mobile, sm:hidden) otwierający drawer animowany od lewej.
// Zawiera wszystkie pozycje jak desktop-sidebar + Nowy post.
export function MobileSidebar({ role, featureFlags = DEFAULT_FEATURE_FLAGS }: MobileSidebarProps) {
	const [open, setOpen] = useState(false);
	const { pathname } = useLocation();
	const { resolvedTheme } = useTheme();
	const items = NAV_ITEMS.filter((item) => isNavItemVisible(item, { role, featureFlags }));

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
								<Icon
									className="size-6 shrink-0"
									fill={isActive && item.fillWhenActive ? "currentColor" : "none"}
								/>
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
