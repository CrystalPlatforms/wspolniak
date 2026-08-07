// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from "react";

/**
 * Czy bieżące środowisko wspiera edytor WYSIWYG?
 *
 * Zwraca `true` TYLKO na szerokim ekranie (desktop, `min-width: 1024px`)
 * w zwykłej przeglądarce — wyklucza PWA (tryb standalone) oraz wąskie ekrany
 * mobile. Edytor WYSIWYG jest ciężki i nieporęczny na telefonie, a w
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
		const desktop = window.matchMedia("(min-width: 1024px)");
		const standalone = window.matchMedia("(display-mode: standalone)");
		const update = () => setSupports(desktop.matches && !standalone.matches);
		update();
		desktop.addEventListener("change", update);
		return () => desktop.removeEventListener("change", update);
	}, []);
	return supports;
}
