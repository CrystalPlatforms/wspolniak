// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconCheck, IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";

interface ThemeToggleProps {
	variant?: "default" | "outline" | "ghost";
	size?: "sm" | "default" | "lg";
	showLabel?: boolean;
	align?: "start" | "center" | "end";
	className?: string;
}

export function ThemeToggle({
	variant = "ghost",
	size = "default",
	showLabel = false,
	align = "end",
	className,
}: ThemeToggleProps) {
	const { theme, setTheme, resolvedTheme } = useTheme();

	const getCurrentIcon = () => {
		if (theme === "system") {
			return (
				<IconDeviceDesktop
					className="h-4 w-4 transition-all duration-300 ease-in-out"
					aria-hidden="true"
				/>
			);
		}

		if (resolvedTheme === "dark") {
			return (
				<IconMoon className="h-4 w-4 transition-all duration-500 ease-in-out" aria-hidden="true" />
			);
		}

		return (
			<IconSun className="h-4 w-4 transition-all duration-500 ease-in-out" aria-hidden="true" />
		);
	};

	const themeOptions = [
		{ value: "light" as const, label: "Jasny", icon: IconSun, description: "Zawsze jasny motyw" },
		{ value: "dark" as const, label: "Ciemny", icon: IconMoon, description: "Zawsze ciemny motyw" },
		{
			value: "system" as const,
			label: "Systemowy",
			icon: IconDeviceDesktop,
			description: "Motyw z ustawień systemu",
		},
	];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant={variant}
					size={size}
					className={cn(
						"relative overflow-hidden transition-all duration-200 ease-in-out hover:scale-105 active:scale-95 focus:ring-2 focus:ring-ring focus:ring-offset-2",
						showLabel ? "gap-2" : "aspect-square",
						className,
					)}
					aria-label="Zmień motyw"
				>
					<div className="relative flex items-center justify-center">{getCurrentIcon()}</div>
					{showLabel && (
						<span className="text-sm font-medium">
							{themeOptions.find((option) => option.value === theme)?.label}
						</span>
					)}
					<span className="sr-only">
						Aktualny motyw:{" "}
						{theme === "system"
							? `Systemowy (${resolvedTheme})`
							: themeOptions.find((o) => o.value === theme)?.label}
					</span>
				</Button>
			</DropdownMenuTrigger>

			<DropdownMenuContent
				align={align}
				className="w-56 p-2 bg-popover/95 backdrop-blur-sm border border-border/50 shadow-lg"
			>
				<div className="grid gap-1">
					{themeOptions.map((option) => {
						const Icon = option.icon;
						const isSelected = theme === option.value;

						return (
							<DropdownMenuItem
								key={option.value}
								onClick={() => setTheme(option.value)}
								className={cn(
									"flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all duration-200 ease-in-out hover:bg-accent/80 focus:bg-accent/80 rounded-md group",
									isSelected && "bg-accent/60 text-accent-foreground",
								)}
							>
								<div className="flex items-center justify-center w-5 h-5">
									<Icon
										className={cn(
											"h-4 w-4 transition-all duration-200 group-hover:scale-105",
											isSelected ? "text-accent-foreground scale-110" : "text-muted-foreground",
										)}
									/>
								</div>

								<div className="flex flex-col flex-1 min-w-0">
									<span
										className={cn(
											"text-sm font-medium leading-none",
											isSelected ? "text-accent-foreground" : "text-foreground",
										)}
									>
										{option.label}
									</span>
									<span className="text-xs text-muted-foreground mt-0.5 leading-none">
										{option.description}
									</span>
								</div>

								{isSelected && (
									<IconCheck
										className="h-4 w-4 text-accent-foreground animate-in fade-in-0 zoom-in-75 duration-150"
										aria-hidden="true"
									/>
								)}
							</DropdownMenuItem>
						);
					})}
				</div>

				{resolvedTheme && (
					<div className="border-t border-border/50 mt-2 pt-2">
						<div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
							<div
								className={cn(
									"w-2 h-2 rounded-full transition-colors duration-200",
									resolvedTheme === "dark" ? "bg-blue-500" : "bg-amber-500",
								)}
							/>
							Aktywny: {resolvedTheme === "dark" ? "ciemny" : "jasny"} motyw
						</div>
					</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
