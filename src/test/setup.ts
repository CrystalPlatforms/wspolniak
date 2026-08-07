// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Globalny setup testów Vitest (jsdom).
 *
 * jsdom nie implementuje scrollowania (nie ma layoutu), więc `Element.prototype.scrollIntoView`
 * w ogóle nie istnieje. Komponenty, które utrzymują aktywny element w widoku (np. aktywny wiersz
 * dropdownu @mentions), wołają tę metodę — stubujemy ją tutaj jako no-op, żeby testy komponentów
 * nie rzucały `TypeError`. Pojedynczy test może nadpisać ją własnym spy na konkretnej instancji.
 */
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
	Element.prototype.scrollIntoView = function scrollIntoView() {};
}

/**
 * jsdom nie implementuje ResizeObserver (brak layoutu). Komponenty Radix mierzą
 * elementy w layoucie — np. `Switch` mierzy swój thumb przez `@radix-ui/react-use-size`,
 * a Dialog/Popover/Select mierzą trigger. Bez tego stuba rzucają `ReferenceError:
 * ResizeObserver is not defined`. No-op: testy nie polegają na wymiarach (jsdom ich
 * nie liczy), wystarczy że konstruktor i metody istnieją.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
	class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	globalThis.ResizeObserver = ResizeObserver;
}

/**
 * jsdom nie implementuje `window.matchMedia` (brak layoutu / media queries).
 * `useSupportsRichText` i lokalny `useIsDesktop` wołają je do detekcji szerokości
 * ekranu i trybu standalone. Bez stuba hooki cicho zwracają false (mobile), przez
 * co komponenty warunkowe (np. switch „Formatowanie") nie renderują się w testach
 * formularzy. Domyślnie `matches: true` = desktop; pojedynczy test może nadpisać
 * `window.matchMedia` własnym stubem z `matches: false`.
 */
if (typeof window !== "undefined") {
	window.matchMedia = (query: string): MediaQueryList =>
		({
			// Desktop (szeroki ekran) = true, ale tryb standalone (PWA) = false —
			// inaczej `useSupportsRichText` widziałby „desktop && standalone" = true.
			matches: !query.includes("standalone"),
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}) as MediaQueryList;
}
