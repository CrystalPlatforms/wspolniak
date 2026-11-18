// SPDX-License-Identifier: AGPL-3.0-or-later

/*
 * Wspólniak Glass (#234, F1) — rdzeń warstwy szkła.
 *
 * Moduł celowo naraża mały interfejs (deep module): preferencja (useGlass),
 * atrybut trybu na <html>, dwie nazwy klas receptur i skrypt pre-paint.
 * Filtry refrakcji, mapa przesunięć i ścieżka Safari zostają wewnątrz modułu.
 *
 * SSR-safety (jak ThemeProvider): pierwszy render klienta i render serwera
 * mają ten sam stan efektywny (default ON), więc hydratacja nie ma mismatchu.
 * Stored-OFF koryguje się w efekcie po mount — wizualnie zero mignięcia,
 * bo skrypt pre-paint usuwa atrybut przed pierwszym malowaniem, a CSS
 * receptur jest dodatkowo bramkowany atrybutem.
 */

import * as React from "react";
import { isDocsHostname } from "@/docs/host";

/** Atrybut trybu szkła na documentElement — cała warstwa CSS od niego zależy. */
export const GLASS_ATTRIBUTE = "data-glass";
export const GLASS_ATTRIBUTE_VALUE = "on";

/** Klucz localStorage per urządzenie (jak ui-theme); brak wpisu = default ON. */
export const GLASS_STORAGE_KEY = "ui-glass";

/** Receptury: lekkie szkło (karty) i pełne szkło (nawigacja, FAB). */
export const GLASS_SURFACE_CLASS = "glass-surface";
export const GLASS_CHROME_CLASS = "glass-chrome";

const DEFAULT_GLASS_ON = true;

/** Host docs.* jest poza zakresem szkła (PRD #233) — niezależnie od zapisu. */
export function isGlassExcludedHostname(hostname: string): boolean {
	return isDocsHostname(hostname);
}

function isGlassExcludedHost(): boolean {
	if (typeof window === "undefined") return false;
	try {
		return isGlassExcludedHostname(window.location.hostname);
	} catch {
		return false;
	}
}

/**
 * Rozstrzygnięcie preferencji z localStorage. Wartości: "on"/"off";
 * brak wpisu i śmieci = default ON. Host docs.* wymusza OFF.
 * Wywoływana tylko po stronie klienta.
 */
export function readGlassPreference(): boolean {
	if (isGlassExcludedHost()) return false;
	try {
		return window.localStorage.getItem(GLASS_STORAGE_KEY) !== "off";
	} catch {
		return DEFAULT_GLASS_ON;
	}
}

/**
 * Skrypt do <head>, renderowany SSR — ustawia/usuwa atrybut PRZED pierwszym
 * malowaniem (zero FOUC): stored-ON i stored-OFF mają od pierwszej klatki
 * właściwą stylistykę, zanim jeszcze dojdzie do hydratacji. Logika musi być
 * 1:1 z readGlassPreference().
 */
export function GlassHeadScript() {
	const script =
		"try{var d=document.documentElement;" +
		'if(location.hostname.indexOf("docs.")===0||localStorage.getItem("ui-glass")==="off")' +
		'{d.removeAttribute("data-glass")}else{d.setAttribute("data-glass","on")}}catch(e){}';
	return <script>{script}</script>;
}

interface GlassContextValue {
	/** Czy warstwa szkła jest aktywna (efektywnie, po mount). */
	on: boolean;
	/** Zmiana preferencji: zapis localStorage + natychmiastowy efekt, bez reloadu. */
	setOn: (next: boolean) => void;
}

/**
 * Kontekst poza providerem = szkło wyłączone (graceful): komponenty renderowane
 * w testach/starych ścieżkach bez providera wyglądają jak przy glass OFF.
 */
const GlassContext = React.createContext<GlassContextValue>({
	on: false,
	setOn: () => null,
});

export function GlassProvider({ children }: { children: React.ReactNode }) {
	// Preferyncja czytana od razu po stronie klienta (lazy init), serwer = default.
	const [storedOn, setStoredOn] = React.useState<boolean>(() => {
		if (typeof window === "undefined") return DEFAULT_GLASS_ON;
		return readGlassPreference();
	});
	const [isMounted, setIsMounted] = React.useState(false);

	// Pierwszy render klienta (hydratacja) MUSI dorównać SSR: default ON.
	// Po mount wchodzimy w stan z storage — zero hydration mismatch.
	const on = isMounted ? storedOn : DEFAULT_GLASS_ON;

	React.useEffect(() => {
		setIsMounted(true);
	}, []);

	// Atrybut utrzymywany w efekcie — spójny ze stanem także po toggle
	// (aplikacja natychmiastowa, bez przeładowania).
	React.useEffect(() => {
		if (typeof document === "undefined") return;
		const root = document.documentElement;
		if (on) {
			root.setAttribute(GLASS_ATTRIBUTE, GLASS_ATTRIBUTE_VALUE);
		} else {
			root.removeAttribute(GLASS_ATTRIBUTE);
		}
	}, [on]);

	const setOn = React.useCallback((next: boolean) => {
		if (isGlassExcludedHost()) return;
		try {
			window.localStorage.setItem(GLASS_STORAGE_KEY, next ? "on" : "off");
		} catch {
			// localStorage niedostępny — stan zostaje tylko w pamięci sesji.
		}
		setStoredOn(next);
	}, []);

	const value = React.useMemo(() => ({ on, setOn }), [on, setOn]);

	return <GlassContext.Provider value={value}>{children}</GlassContext.Provider>;
}

export function useGlass(): GlassContextValue {
	return React.useContext(GlassContext);
}
