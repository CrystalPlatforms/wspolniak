// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link, useLocation } from "@tanstack/react-router";
import {
	Bookmark,
	Calendar,
	ChartNoAxesColumn,
	Cog,
	Home,
	Plus,
	SlidersHorizontal,
	Video,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
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

export function DesktopSidebar({
	role,
	featureFlags = DEFAULT_FEATURE_FLAGS,
}: DesktopSidebarProps) {
	const location = useLocation();
	const { resolvedTheme } = useTheme();

	const items = featureFlags.video
		? NAV_ITEMS
		: NAV_ITEMS.filter((item) => item.to !== "/app/video");

	const logoSrc =
		resolvedTheme === "dark" ? "/logo/WspolniakLogoTrans.png" : "/logo/WspolniakLogoTransLIGHT.png";

	return (
		<aside className="hidden sm:flex sm:flex-col sm:fixed sm:left-0 sm:top-0 sm:bottom-0 sm:w-[220px] sm:bg-background sm:px-4 sm:py-4">
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
						</Link>
					);
				})}

				<ThemeNavItem />
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

function ThemeNavItem() {
	return (
		<ThemeToggle
			variant="ghost"
			size="lg"
			showLabel
			className="h-auto w-full justify-start gap-3 rounded-full px-3 py-3 text-lg font-medium"
		/>
	);
}
