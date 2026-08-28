// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link, useLocation } from "@tanstack/react-router";
import {
	Bookmark,
	Calendar,
	ChartNoAxesColumn,
	Home,
	Images,
	MessageSquare,
	Plus,
	SlidersHorizontal,
	Video,
} from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { useAlbumsNewDot } from "@/core/albums-seen";
import { useBootReveal } from "@/core/boot-splash";
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

interface DesktopSidebarProps {
	role?: string;
	featureFlags?: FeatureFlags;
}

const NAV_ITEMS: NavItem[] = [
	{ to: "/app", icon: Home, label: "Feed", exact: true },
	{ to: "/app/video", icon: Video, label: "Wideo", fillWhenActive: true },
	{ to: "/app/lib", icon: Bookmark, label: "Biblioteka", fillWhenActive: true },
	// Albumy (#170): sekcja zbiorów rodzinnych; brak flagi w F1 — zawsze widoczna.
	// Bez fillWhenActive — wypełniona ikona Images wygląda źle (reviza usera).
	{ to: "/app/albums", icon: Images, label: "Albumy" },
	// F8 #159: nazwa usera „Chat" (nie „Czat"); wypełniona gdy aktywna.
	{ to: "/app/chat", icon: MessageSquare, label: "Chat", fillWhenActive: true },
	{ to: "/app/admin", icon: SlidersHorizontal, label: "Admin", adminOnly: true },
	{
		to: "/app/calendar",
		icon: Calendar,
		label: "Kalendarz",
		adminOnly: false,
		fillWhenActive: true,
	},
	{ to: "/app/stats", icon: ChartNoAxesColumn, label: "Statystyki", adminOnly: false },
	// Ustawienia przeniesione do nagłówka feeda (ikona Cog obok „Witaj", reviza usera).
];

export function DesktopSidebar({
	role,
	featureFlags = DEFAULT_FEATURE_FLAGS,
}: DesktopSidebarProps) {
	const location = useLocation();
	const { resolvedTheme } = useTheme();

	const items = NAV_ITEMS.filter((item) => {
		if (item.to === "/app/video" && !featureFlags.video) return false;
		if (item.to === "/app/lib" && !featureFlags.library) return false;
		if (item.to === "/app/chat" && !featureFlags.chat) return false;
		if (item.to === "/app/albums" && !featureFlags.albums) return false;
		return true;
	});

	// Kropka „new" przy „Albumy" (#176): najnowszy album vs timestamp widzianych.
	const hasNewAlbums = useAlbumsNewDot();

	const logoSrc =
		resolvedTheme === "dark" ? "/logo/WspolniakLogoTrans.png" : "/logo/WspolniakLogoTransLIGHT.png";

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

			<div className="mt-6 flex flex-col gap-2 px-3">
				{featureFlags.video && (
					<Link to="/app/new-video">
						<Button className="w-full rounded-full bg-[#0c275f] py-4 text-lg font-bold text-white hover:bg-[#0c275f]/90">
							<Video className="mr-2 size-6" />
							Dodaj wideo
						</Button>
					</Link>
				)}
				<Link to="/app/new">
					<Button className="w-full rounded-full py-4 text-lg font-bold">
						<Plus className="mr-2 size-6" />
						Nowy post
					</Button>
				</Link>
			</div>
		</aside>
	);
}
