// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	IconAlertCircle,
	IconAlertTriangle,
	IconBell,
	IconBolt,
	IconBug,
	IconClock,
	IconCoffee,
	IconDatabase,
	IconHammer,
	IconHeart,
	IconLock,
	IconPower,
	IconRocket,
	IconSettings,
	IconSun,
	IconTool,
	type TablerIcon,
} from "@tabler/icons-react";

/**
 * Kuratowany zestaw ikon ekranu serwisowego (GH #230, reviza usera #245).
 * Świadomie zamiast `import *` z biblioteki ikon — namespace import wyłączyłby
 * tree-shaking i dociągnął do bundla kilka MB niewykorzystanych ikon.
 * Jedno źródło prawdy dla overlaya i panelu admina: admin WYBIERA ikonę
 * z listy (zamiast wpisywać nazwę), więc nie ma ścieżki na nieznany klucz.
 */
export interface MaintenanceIconChoice {
	/** Klucz zapisywany w konfiguracji instancji (kebab-case). */
	key: string;
	/** Polska etykieta dla panelu admina. */
	label: string;
	Icon: TablerIcon;
}

export const MAINTENANCE_ICONS: MaintenanceIconChoice[] = [
	{ key: "alert-triangle", label: "Ostrzeżenie", Icon: IconAlertTriangle },
	{ key: "alert-circle", label: "Informacja", Icon: IconAlertCircle },
	{ key: "wrench", label: "Naprawa", Icon: IconTool },
	{ key: "hammer", label: "Prace", Icon: IconHammer },
	{ key: "settings", label: "Ustawienia", Icon: IconSettings },
	{ key: "bell", label: "Dzwonek", Icon: IconBell },
	{ key: "clock", label: "Zaraz wrócimy", Icon: IconClock },
	{ key: "zap", label: "Błyskawica", Icon: IconBolt },
	{ key: "power", label: "Przerwa", Icon: IconPower },
	{ key: "bug", label: "Błąd", Icon: IconBug },
	{ key: "database", label: "Baza danych", Icon: IconDatabase },
	{ key: "lock", label: "Kłódka", Icon: IconLock },
	{ key: "heart", label: "Serce", Icon: IconHeart },
	{ key: "rocket", label: "Rakieta", Icon: IconRocket },
	{ key: "sun", label: "Słońce", Icon: IconSun },
	{ key: "coffee", label: "Kawa", Icon: IconCoffee },
];

const FALLBACK_ICON_KEY = "alert-triangle";

/** Nazwa z konfiguracji (może być stara/nieznana) → wybór z rejestru. */
export function resolveMaintenanceIcon(name: string): MaintenanceIconChoice {
	const lower = (name ?? "").toLowerCase();
	const found = MAINTENANCE_ICONS.find((choice) => choice.key === lower);
	return found ?? (MAINTENANCE_ICONS[0] as MaintenanceIconChoice);
}

/** Klucz awaryjny — używany też jako wartość domyślna konfiguracji. */
export const MAINTENANCE_FALLBACK_ICON_KEY = FALLBACK_ICON_KEY;
