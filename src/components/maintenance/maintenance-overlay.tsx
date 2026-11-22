// SPDX-License-Identifier: AGPL-3.0-or-later
import { resolveMaintenanceIcon } from "./maintenance-icons";

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

/**
 * Ekran serwisowy. Ikona rozwiązana przez współdzielony rejestr
 * (maintenance-icons) — ten sam zestaw, który admin widzi w panelu; nazwa
 * poza rejestrem (stara konfiguracja) spada na ostrzeżenie.
 */
export function MaintenanceOverlay({ message, subtitle, icon }: MaintenanceOverlayProps) {
	const choice = resolveMaintenanceIcon(icon);
	const Icon = choice.Icon;

	return (
		<div
			role="alertdialog"
			aria-modal="true"
			className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-background px-6 text-center"
		>
			<Icon role="img" aria-label={choice.key} className="h-24 w-24 shrink-0 text-warning" />
			<h1 className="max-w-md text-2xl font-bold text-foreground">{message}</h1>
			<p className="max-w-md text-base text-muted-foreground">{subtitle}</p>
		</div>
	);
}
