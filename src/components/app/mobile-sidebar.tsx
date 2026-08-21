// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link, useLocation } from "@tanstack/react-router";
import {
	Bookmark,
	Calendar,
	ChartNoAxesColumn,
	Cog,
	Home,
	Menu,
	Plus,
	SlidersHorizontal,
	Video,
} from "lucide-react";
import { useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
	{ to: "/app", icon: Home, label: "Feed", exact: true },
	{ to: "/app/video", icon: Video, label: "Wideo", fillWhenActive: true },
	{ to: "/app/lib", icon: Bookmark, label: "Biblioteka", fillWhenActive: true },
	{ to: "/app/admin", icon: SlidersHorizontal, label: "Admin", adminOnly: true },
	{
		to: "/app/calendar",
		icon: Calendar,
		label: "Kalendarz",
		adminOnly: true,
		fillWhenActive: true,
	},
	{ to: "/app/stats", icon: ChartNoAxesColumn, label: "Statystyki", adminOnly: false },
	{ to: "/app/settings", icon: Cog, label: "Ustawienia" },
];

interface MobileSidebarProps {
	role?: string;
	featureFlags?: FeatureFlags;
}

// Hamburger (tylko mobile, sm:hidden) otwierający drawer animowany od lewej.
// Zawiera wszystkie pozycje jak desktop-sidebar + Nowy post.
export function MobileSidebar({ role, featureFlags = DEFAULT_FEATURE_FLAGS }: MobileSidebarProps) {
	const [open, setOpen] = useState(false);
	const { pathname } = useLocation();
	const { resolvedTheme } = useTheme();
	const items = NAV_ITEMS.filter((item) => {
		if (item.adminOnly && role !== "admin") return false;
		if (item.to === "/app/video" && !featureFlags.video) return false;
		if (item.to === "/app/lib" && !featureFlags.library) return false;
		return true;
	});
	const logoSrc =
		resolvedTheme === "dark" ? "/logo/WspolniakLogoTrans.png" : "/logo/WspolniakLogoTransLIGHT.png";

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<button
					type="button"
					aria-label="Otwórz menu"
					className="rounded-md p-2 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:hidden"
				>
					<Menu className="h-12 w-12" />
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
							</Link>
						);
					})}
				</nav>

				<div className="flex flex-col gap-2 border-t border-border p-4">
					{featureFlags.video && (
						<Link to="/app/new-video" onClick={() => setOpen(false)}>
							<Button className="w-full rounded-full bg-[#0c275f] py-4 text-lg font-bold text-white hover:bg-[#0c275f]/90">
								<Video className="mr-2 size-6" />
								Dodaj wideo
							</Button>
						</Link>
					)}
					<Link to="/app/new" onClick={() => setOpen(false)}>
						<Button className="w-full rounded-full py-4 text-lg font-bold">
							<Plus className="mr-2 size-6" />
							Nowy post
						</Button>
					</Link>
				</div>
			</SheetContent>
		</Sheet>
	);
}
