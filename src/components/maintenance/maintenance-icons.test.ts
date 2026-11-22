// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia (reviza usera #245): admin WYBIERA ikonę z listy (grid w panelu),
// więc nie ma ścieżki na nieznany klucz — resolve istnieje dla STARYCH konfiguracji
// zapisanych przed przebudową; nieznana nazwa spada na ostrzeżenie (fallback).
import { describe, expect, it } from "vitest";
import {
	MAINTENANCE_FALLBACK_ICON_KEY,
	MAINTENANCE_ICONS,
	resolveMaintenanceIcon,
} from "./maintenance-icons";

describe("maintenance icons", () => {
	it("eksponuje kuratowany zestaw z unikalnymi kluczami", () => {
		const keys = MAINTENANCE_ICONS.map((choice) => choice.key);
		expect(new Set(keys).size).toBe(keys.length);
		expect(keys).toContain("alert-triangle");
		expect(keys).toContain("wrench");
	});

	it("rozwiązuje znaną nazwę z konfiguracji (case-insensitive)", () => {
		expect(resolveMaintenanceIcon("Wrench").key).toBe("wrench");
		expect(resolveMaintenanceIcon("alert-triangle").label).toBe("Ostrzeżenie");
	});

	it("nieznana/stara nazwa spada na ostrzeżenie (fallback)", () => {
		expect(resolveMaintenanceIcon("icon-rocket-from-tabler").key).toBe(
			MAINTENANCE_FALLBACK_ICON_KEY,
		);
		expect(resolveMaintenanceIcon("").key).toBe(MAINTENANCE_FALLBACK_ICON_KEY);
	});
});
