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
 * jsdom nie implementuje też `Element.prototype.scrollTo` (brak layoutu) — czat
 * przewija listę wiadomości na dół (F2). No-op jak wyżej; test może nadpisać
 * własnym spy na konkretnej instancji elementu.
 */
if (typeof Element !== "undefined" && typeof Element.prototype.scrollTo !== "function") {
	Element.prototype.scrollTo = function scrollTo() {};
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
 * jsdom nie implementuje globalnej klasy `PointerEvent`. `motion-dom` (gesty
 * whileTap) syntetyzuje PointerEvent przy zdarzeniach klawiatury na przyciskach
 * z gestami — bez stuba rzuca `ReferenceError: PointerEvent is not defined`
 * (Reactions 3.0). Stub rozszerza MouseEvent — jak w przeglądarce, PointerEvent
 * JEST MouseEvent (dnd-kit polega na tych polach). Uwaga (#167): dzięki
 * wiernemu `button=0` Radix odraca dismiss dialogu na click — testy zamykające
 * dialogi przez pointerdown muszą dosymulować także click (jak prawdziwy klik).
 */
if (typeof globalThis.PointerEvent === "undefined") {
	class PointerEventStub extends MouseEvent {
		pointerId: number;
		pointerType: string;
		isPrimary: boolean;
		constructor(
			type: string,
			params: MouseEventInit & {
				pointerId?: number;
				pointerType?: string;
				isPrimary?: boolean;
			} = {},
		) {
			super(type, params);
			this.pointerId = params.pointerId ?? 1;
			this.pointerType = params.pointerType ?? "mouse";
			this.isPrimary = params.isPrimary ?? true;
		}
	}
	globalThis.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
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

/**
 * `window.localStorage` bywa niedostępny w tym środowisku testowym (Node 22+
 * wystawia własny eksperymentalny localStorage bez `--localstorage-file` i
 * przysłania jsdomowy). Kropka „nowe albumy" (#176) trzyma timestamp „widzianych"
 * w localStorage — bez stuba każde dotknięcie rzuca lub cicho nic nie zapisuje.
 * In-memory mapa: API zgodne z Storage; test czyści ją przez clear() w afterEach.
 */
if (typeof window !== "undefined" && typeof window.localStorage === "undefined") {
	const store = new Map<string, string>();
	const storageStub: Storage = {
		getItem: (key: string): string | null => (store.has(key) ? (store.get(key) as string) : null),
		setItem: (key: string, value: string): void => void store.set(key, String(value)),
		removeItem: (key: string): void => void store.delete(key),
		clear: (): void => void store.clear(),
		key: (index: number): string | null => Array.from(store.keys())[index] ?? null,
		length: 0,
	};
	Object.defineProperty(window, "localStorage", {
		get: () => {
			(storageStub as { length: number }).length = store.size;
			return storageStub;
		},
		configurable: true,
	});
}
