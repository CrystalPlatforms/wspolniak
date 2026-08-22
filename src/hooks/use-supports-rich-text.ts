// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from "react";

/**
 * Czy bieżące środowisko wspiera edytor WYSIWYG?
 *
 * Zwraca `true` na ekranach od szerokości tabletu w górę (`min-width: 768px`)
 * w zwykłej przeglądarce — wyklucza PWA (tryb standalone) oraz telefony
 * (wąskie ekrany poniżej 768px). Tablety i mniejsze okna na laptopie dostają
 * formatowanie normalnie. Edytor WYSIWYG jest ciężki i nieporęczny na telefonie, a w
 * zainstalowanej aplikacji (PWA) celowo ukrywamy formatowanie, by trzymać
 * ją prostą.
 *
 * Głęboki moduł: mały interface (boolean) ukrywa detekcję szerokości ekranu,
 * trybu standalone i nasłuch zmian. Bez `matchMedia` (SSR / jsdom) zawsze
 * `false` — bezpiecznym fallbackiem jest zwykłe pole tekstowe.
 */
export function useSupportsRichText(): boolean {
	const [supports, setSupports] = useState(false);
	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		const wide = window.matchMedia("(min-width: 768px)");
		const standalone = window.matchMedia("(display-mode: standalone)");
		const update = () => setSupports(wide.matches && !standalone.matches);
		update();
		wide.addEventListener("change", update);
		return () => wide.removeEventListener("change", update);
	}, []);
	return supports;
}
