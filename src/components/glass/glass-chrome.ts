// SPDX-License-Identifier: AGPL-3.0-or-later

// Wspólniak Glass (#235, F2) — hook dopinający refrakcję na chrome elementach
// (nav + FAB). Mierzy element, cacheuje filtr per rozmiar i ustawia zmienne
// CSS --glass-filter/--glass-rim na elemencie. Bez wsparcia środowiska
// (jsdom, brak canvas) zostaje rozmycie z receptury — graceful degradation.

import * as React from "react";
import { useGlass } from "./glass-provider";
import { ensureChromeFilter } from "./glass-refraction";

/**
 * Filtry url() w backdrop-filter deklarujemy tylko, gdy silnik je wspiera —
 * w przeciwnym razie cała deklaracja spadłaby i znikłoby rozmycie (Firefox).
 */
function supportsRefraction(): boolean {
	try {
		if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
		return (
			CSS.supports("backdrop-filter", "url('#glass-r-x')") ||
			CSS.supports("-webkit-backdrop-filter", "url('#glass-r-x')")
		);
	} catch {
		return false;
	}
}

/** Promień z computed style: "16px" → 16, "50%" → udział min(w,h), brak → 0. */
function measuredRadius(el: HTMLElement, minSide: number): number {
	try {
		const raw = getComputedStyle(el).borderTopLeftRadius;
		if (!raw) return 0;
		if (raw.endsWith("%")) {
			const pct = Number.parseFloat(raw);
			return Number.isFinite(pct) ? (pct / 100) * minSide : 0;
		}
		const px = Number.parseFloat(raw);
		return Number.isFinite(px) ? px : 0;
	} catch {
		return 0;
	}
}

/**
 * Refrakcja chrome: ref na element + stan ON z kontekstu. Gdy ON i silnik
 * wspiera refrakcję, mierzy element (ResizeObserver) i dopina filtr per
 * rozmiar; bez wsparcia zostaje rozmycie z receptury.
 */
export function useGlassChrome<El extends HTMLElement = HTMLElement>(): {
	ref: React.RefObject<El | null>;
	on: boolean;
} {
	const { on } = useGlass();
	const ref = React.useRef<El | null>(null);

	React.useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (!on) {
			el.style.removeProperty("--glass-filter");
			el.style.removeProperty("--glass-rim");
			return;
		}
		if (!supportsRefraction()) return;

		const applyLens = (): void => {
			const width = el.offsetWidth;
			const height = el.offsetHeight;
			if (!width || !height) return;
			const radius = measuredRadius(el, Math.min(width, height));
			const filter = ensureChromeFilter(width, height, radius);
			if (!filter) return;
			el.style.setProperty("--glass-filter", `url(#${filter.id})`);
			if (filter.rim) {
				el.style.setProperty("--glass-rim", `url(${filter.rim})`);
			}
		};

		const observer = new ResizeObserver(applyLens);
		observer.observe(el);
		applyLens();
		return () => {
			observer.disconnect();
			el.style.removeProperty("--glass-filter");
			el.style.removeProperty("--glass-rim");
		};
	}, [on]);

	return { ref, on };
}
