// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	IconAlertCircle,
	IconAlertTriangle,
	IconBell,
	IconBolt,
	IconBug,
	IconClock,
	IconDatabase,
	IconHammer,
	IconLock,
	IconPower,
	IconSettings,
	IconTool,
	type TablerIcon,
} from "@tabler/icons-react";

export interface MaintenanceOverlayProps {
	message: string;
	subtitle: string;
	icon: string;
}

export interface MaintenanceDecisionInput {
	enabled: boolean;
}

export function shouldShowMaintenanceOverlay(
	config: MaintenanceDecisionInput,
	role: string,
): boolean {
	return config.enabled && role !== "admin";
}

// Kuratowany zestaw ikon ekranu serwisowego (GH #230). Świadomie zamiast
// `import *` z biblioteki ikon — namespace import wyłączyłby tree-shaking
// i dociągnął do bundla kilka MB niewykorzystanych ikon. Nazwy kebab-case
// zapisywane w konfiguracji instancji; nieznana nazwa → alert-triangle.
const iconRegistry: Record<string, TablerIcon> = {
	"alert-triangle": IconAlertTriangle,
	"alert-circle": IconAlertCircle,
	wrench: IconTool,
	hammer: IconHammer,
	settings: IconSettings,
	bell: IconBell,
	clock: IconClock,
	zap: IconBolt,
	power: IconPower,
	bug: IconBug,
	database: IconDatabase,
	lock: IconLock,
};

const FALLBACK_ICON_KEY = "alert-triangle";

function resolveIconKey(name: string): string {
	if (name && iconRegistry[name.toLowerCase()]) return name;
	return FALLBACK_ICON_KEY;
}

export function MaintenanceOverlay({ message, subtitle, icon }: MaintenanceOverlayProps) {
	const iconKey = resolveIconKey(icon);
	const Icon = iconRegistry[iconKey.toLowerCase()] ?? IconAlertTriangle;

	return (
		<div
			role="alertdialog"
			aria-modal="true"
			className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-background px-6 text-center"
		>
			<Icon role="img" aria-label={iconKey} className="h-24 w-24 shrink-0 text-warning" />
			<h1 className="max-w-md text-2xl font-bold text-foreground">{message}</h1>
			<p className="max-w-md text-base text-muted-foreground">{subtitle}</p>
		</div>
	);
}
