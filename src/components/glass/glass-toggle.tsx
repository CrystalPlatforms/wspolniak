// SPDX-License-Identifier: AGPL-3.0-or-later

/*
 * Przełącznik „Efekt szklany (Wspólniak Glass)" (#234) — wiersz w sekcji
 * Wygląd na /app/settings, pod przełącznikiem motywu. Zmiana działa
 * natychmiast (kontekst → atrybut + klasy), bez przeładowania strony.
 */

import { Switch } from "@/components/ui/switch";
import { useGlass } from "./glass-provider";

export function GlassToggle() {
	const { on: glassOn, setOn: setGlassOn } = useGlass();
	return (
		<div className="flex items-center justify-between gap-4">
			<span className="flex flex-col">
				<span className="font-medium text-foreground">Efekt szklany (Wspólniak Glass)</span>
				<span className="text-sm text-muted-foreground">
					Szklane karty i rozmyty pasek nawigacji. Wyłącz, gdy wolisz klasyczny wygląd.
				</span>
			</span>
			<Switch
				checked={glassOn}
				onCheckedChange={setGlassOn}
				aria-label="Efekt szklany (Wspólniak Glass)"
			/>
		</div>
	);
}
