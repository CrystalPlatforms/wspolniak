// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef } from "react";

/** Miniony odstęp między kontrolami nowej wersji SW (oszczędza requesty). */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Samonaprawa długich sesji PWA po deployu (#226): dokument z poprzedniego
 * builda importuje lazy-chunki po hashach, które nowy deploy usuwa z Workera
 * („Importing a module script failed").
 *
 * Dwuetapowo:
 * 1. Gdy strona działa pod STARYM workerem (`controller` istnieje), przejęcie
 *    kontroli przez nowego (`controllerchange`, worker robi skipWaiting+claim)
 *    przeładowuje dokument — świeży HTML reference'uje istniejące assety.
 * 2. iOS zawiesza/wznawia PWA bez nawigacji, więc przeglądarka sama nie sprawdzi
 *    aktualizacji — przy powrocie widoczności wołamy `registration.update()`
 *    (z throttlingiem), żeby deploy został wykryty od razu, zanim user wejdzie
 *    w trasę ładującą usunięty chunk.
 *
 * Pierwsza instalacja (brak controllera) nie przeładowuje strony.
 *
 * `reload` to granica testowa (jsdom nie pozwala szpiegować location.reload) —
 * w produkcji zostaje domyślny.
 */
export function useSwUpdateReload(reload: () => void = () => window.location.reload()) {
	// Ref zamiast deps — domyślny callback to nowa funkcja co render, efekt
	// ma się ustawić raz na żywotność komponentu.
	const reloadRef = useRef(reload);
	reloadRef.current = reload;

	useEffect(() => {
		if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

		let reloading = false;
		let lastCheck = 0;

		if (navigator.serviceWorker.controller) {
			navigator.serviceWorker.addEventListener("controllerchange", () => {
				if (reloading) return;
				reloading = true;
				reloadRef.current();
			});
		}

		function checkForUpdate() {
			const now = Date.now();
			if (now - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
			lastCheck = now;
			void navigator.serviceWorker.ready
				.then((registration) => registration.update())
				.catch(() => {});
		}

		function onVisibilityChange() {
			if (document.visibilityState === "visible") checkForUpdate();
		}
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => document.removeEventListener("visibilitychange", onVisibilityChange);
	}, []);
}
