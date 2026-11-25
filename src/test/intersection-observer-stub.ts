// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Stub IntersectionObserver dla testów jsdom (przeglądarkowe API = granica systemu).
 * Użycie: installIntersectionObserverStub() w beforeEach, potem lastStub().trigger(true/false).
 */

export class IntersectionObserverStub {
	static instances: IntersectionObserverStub[] = [];

	callback: IntersectionObserverCallback;
	elements: Element[] = [];
	options: unknown;

	constructor(callback: IntersectionObserverCallback, options?: unknown) {
		this.callback = callback;
		this.options = options;
		IntersectionObserverStub.instances.push(this);
	}

	observe(element: Element): void {
		this.elements.push(element);
	}

	unobserve(element: Element): void {
		this.elements = this.elements.filter((e) => e !== element);
	}

	disconnect(): void {
		this.elements = [];
	}

	/** Ręcznie odpala callback z bieżącymi obserwowanymi elementami. */
	trigger(isIntersecting: boolean): void {
		const entries = this.elements.map(
			(target) =>
				({
					target,
					isIntersecting,
					intersectionRatio: isIntersecting ? 1 : 0,
					time: 0,
					boundingClientRect: target.getBoundingClientRect(),
					intersectionRect: target.getBoundingClientRect(),
					rootBounds: null,
				}) as IntersectionObserverEntry,
		);
		this.callback(entries, this as unknown as IntersectionObserver);
	}
}

/** Podmienia globalny IntersectionObserver na stub (jsdom go nie implementuje). */
export function installIntersectionObserverStub(): void {
	IntersectionObserverStub.instances = [];
	vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
}

/** Ostatnio utworzona instancja stuba (hook tworzy jedną na mount). */
export function lastStub(): IntersectionObserverStub {
	const stub = IntersectionObserverStub.instances.at(-1);
	if (!stub) throw new Error("Brak instancji IntersectionObserverStub");
	return stub;
}
