// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from "react";
import "./boot-splash.css";

/** Minimalny czas życia splasha w milisekundach (liczony od startu nawigacji). */
export const SPLASH_MIN_MS = 600;

/** Czas wjazdu pasków nawigacji (boot-slide-*, styles.css) — po nim treść zaczyna się wypełniać (#145). */
export const BOOT_SLIDE_MS = 400;

/** Ile jeszcze czekać z ukryciem splasha; 0, gdy minimum już minęło. */
export function splashRemainingMs(elapsedMs: number): number {
	return Math.max(0, SPLASH_MIN_MS - elapsedMs);
}

/**
 * #148 (offline fast-path): stan offline sprawdzany w tle w trakcie splashu.
 * Wykryty offline omija całą choreografię bootu — splash chowa się bez
 * czekania na min. czas, a treść bez czekania na osiadanie pasków
 * (cache'owany feed ma być widoczny natychmiast, banner offline informuje).
 */
function isOfflineBoot(): boolean {
	return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Stan bootu jako singleton modułu: timer żyje niezależnie od remountów
 * (error boundary nie przywraca splasha ani nie tworzy drugiego timera).
 */
let bootReady = false;
let bootReadyAt: number | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const readyListeners = new Set<() => void>();

function markBootReady() {
	bootReady = true;
	bootReadyAt = performance.now();
	hideTimer = null;
	for (const listener of readyListeners) listener();
}

/** Jednorazowe uruchomienie odliczania: hydratacja + min. SPLASH_MIN_MS od nawigacji (offline: natychmiast). */
function ensureBootTimer() {
	if (bootReady || hideTimer !== null) return;
	if (isOfflineBoot()) {
		markBootReady();
		return;
	}
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
 * Stan „paski osiadają": osobny singleton analogiczny do boota — true dopiero
 * BOOT_SLIDE_MS po ukryciu splasha (wjazd nawigacji się kończy). Od tego sygnału
 * karty feedu zaczynają wypełniać się treścią (#145). Późne montże (warm) po
 * osiadnięciu dostają true od razu — choreografia się nie odtwarza.
 */
let bootSettled = false;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
const settledListeners = new Set<() => void>();

function markBootSettled() {
	bootSettled = true;
	settleTimer = null;
	bootReadyAt = null;
	for (const listener of settledListeners) listener();
}

/** Jednorazowe uruchomienie odliczania osiadnięcia: reveal + BOOT_SLIDE_MS (natychmiast, gdy już po czasie; offline: od razu). */
function ensureSettleTimer() {
	if (bootSettled || settleTimer !== null || !bootReady || bootReadyAt === null) return;
	if (isOfflineBoot()) {
		markBootSettled();
		return;
	}
	const remaining = Math.max(0, BOOT_SLIDE_MS - (performance.now() - bootReadyAt));
	if (remaining === 0) {
		markBootSettled();
		return;
	}
	settleTimer = setTimeout(markBootSettled, remaining);
}

/**
 * Sygnał „choreografia bootu zakończona" dla sekwencera treści (#145):
 * `false` podczas splasha i wjazdu pasków, `true` gdy paski osiadły.
 */
export function useBootSettled(): boolean {
	const [settled, setSettled] = useState(bootSettled);
	useEffect(() => {
		const onReady = () => ensureSettleTimer();
		const onSettled = () => setSettled(true);
		readyListeners.add(onReady);
		settledListeners.add(onSettled);
		ensureSettleTimer();
		if (bootSettled) setSettled(true);
		return () => {
			readyListeners.delete(onReady);
			settledListeners.delete(onSettled);
		};
	}, []);
	return settled;
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
