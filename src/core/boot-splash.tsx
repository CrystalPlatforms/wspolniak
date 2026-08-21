// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from "react";
import "./boot-splash.css";

/** Minimalny czas życia splasha w milisekundach (liczony od startu nawigacji). */
export const SPLASH_MIN_MS = 600;

/** Ile jeszcze czekać z ukryciem splasha; 0, gdy minimum już minęło. */
export function splashRemainingMs(elapsedMs: number): number {
	return Math.max(0, SPLASH_MIN_MS - elapsedMs);
}

/**
 * Stan bootu jako singleton modułu: timer żyje niezależnie od remountów
 * (error boundary nie przywraca splasha ani nie tworzy drugiego timera).
 */
let bootReady = false;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const readyListeners = new Set<() => void>();

function markBootReady() {
	bootReady = true;
	hideTimer = null;
	for (const listener of readyListeners) listener();
}

/** Jednorazowe uruchomienie odliczania: hydratacja + min. SPLASH_MIN_MS od nawigacji. */
function ensureBootTimer() {
	if (bootReady || hideTimer !== null) return;
	const remaining = splashRemainingMs(performance.now());
	if (remaining === 0) {
		markBootReady();
		return;
	}
	hideTimer = setTimeout(markBootReady, remaining);
}

/**
 * Sygnał choreografii dla pasków nawigacji: `false` dopóki splash żyje,
 * `true` w chwili jego ukrycia. Późne montże (po ukryciu) dostają `true`
 * od razu — bez odtwarzania animacji.
 */
export function useBootReveal(): boolean {
	const [ready, setReady] = useState(bootReady);
	useEffect(() => {
		ensureBootTimer();
		const listener = () => setReady(true);
		readyListeners.add(listener);
		if (bootReady) setReady(true);
		return () => {
			readyListeners.delete(listener);
		};
	}, []);
	return ready;
}

/**
 * Statyczny splash w shellu HTML: czarne tło, TailChase, tytuł. Widoczny
 * od pierwszego paintu SSR — zero JS, zero danych. Ukrywany po hydratacji
 * (reguła min. SPLASH_MIN_MS), nieprzezroczysty overlay nad aplikacją.
 */
export function BootSplash() {
	const hidden = useBootReveal();
	if (hidden) return null;
	return (
		<div className="boot-splash">
			<output className="loader boot-splash-loader" aria-label="Ładowanie">
				<div className="dot" />
				<div className="dot" />
				<div className="dot" />
				<div className="dot" />
				<div className="dot" />
				<div className="dot" />
			</output>
			<p className="boot-splash-title">Wspólniak</p>
		</div>
	);
}
