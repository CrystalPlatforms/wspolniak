// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from "react";

export interface UseInViewResult<T extends HTMLElement> {
	ref: React.RefObject<T | null>;
	inView: boolean;
}

/**
 * Raportuje, czy element jest w widoku (IntersectionObserver = granica systemu).
 * Lazy loading feedu (#247): treści pod foldem montują się dopiero po wejściu w widok.
 * Guard `typeof window` — SSR (TanStack Start renderuje na serwerze) nie ma IntersectionObserver;
 * tego warunku nie da się przetestować w jsdom, więc chroni go komentarz, nie test.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(): UseInViewResult<T> {
	const ref = useRef<T | null>(null);
	const [inView, setInView] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const element = ref.current;
		if (!element) return;

		const observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					setInView(true);
					observer.disconnect();
				}
			}
		});
		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, []);

	return { ref, inView };
}
