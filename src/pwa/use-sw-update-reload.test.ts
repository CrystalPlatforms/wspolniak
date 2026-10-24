// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests for useSwUpdateReload — self-heal of long-lived PWA sessions after a
// deploy (#226): new SW takes control → document reloads onto fresh chunks;
// visibility-driven registration.update() detects deploys without navigation.
import { act, renderHook } from "@testing-library/react";
import { useSwUpdateReload } from "./use-sw-update-reload";

interface SwStub {
	update: ReturnType<typeof vi.fn>;
	controllerChangeListeners: Set<(event?: unknown) => void>;
	registeredEvents: string[];
}

function stubServiceWorker(opts: { controller: boolean }): SwStub {
	const update = vi.fn().mockResolvedValue(undefined);
	const controllerChangeListeners = new Set<(event?: unknown) => void>();
	const registeredEvents: string[] = [];

	Object.defineProperty(navigator, "serviceWorker", {
		value: {
			controller: opts.controller ? ({ scriptURL: "/sw.js" } as unknown as ServiceWorker) : null,
			addEventListener: (event: string, listener: (event?: unknown) => void) => {
				registeredEvents.push(event);
				if (event === "controllerchange") controllerChangeListeners.add(listener);
			},
			removeEventListener: (_event: string, listener: (event?: unknown) => void) => {
				controllerChangeListeners.delete(listener);
			},
			ready: Promise.resolve({ update } as unknown as ServiceWorkerRegistration),
		},
		configurable: true,
	});
	return { update, controllerChangeListeners, registeredEvents };
}

function fireVisibilityChange() {
	document.dispatchEvent(new Event("visibilitychange"));
}

describe("useSwUpdateReload", () => {
	const reload = vi.fn();

	afterEach(() => {
		// jsdom has no serviceWorker — restore the "unsupported" state.
		Reflect.deleteProperty(navigator, "serviceWorker");
		reload.mockClear();
	});

	it("reloads the document when a new SW takes control (deploy detected)", () => {
		const sw = stubServiceWorker({ controller: true });
		renderHook(() => useSwUpdateReload(reload));

		expect(sw.registeredEvents).toContain("controllerchange");
		act(() => {
			for (const listener of sw.controllerChangeListeners) listener();
		});

		expect(reload).toHaveBeenCalledTimes(1);
	});

	it("does not listen for controllerchange on first install (no controller)", () => {
		const sw = stubServiceWorker({ controller: false });
		renderHook(() => useSwUpdateReload(reload));

		expect(sw.registeredEvents).not.toContain("controllerchange");
	});

	it("reloads only once even if controllerchange fires repeatedly", () => {
		const sw = stubServiceWorker({ controller: true });
		renderHook(() => useSwUpdateReload(reload));

		act(() => {
			for (const listener of sw.controllerChangeListeners) listener();
			for (const listener of sw.controllerChangeListeners) listener();
		});

		expect(reload).toHaveBeenCalledTimes(1);
	});

	it("checks for a SW update when the app becomes visible again", async () => {
		const sw = stubServiceWorker({ controller: true });
		renderHook(() => useSwUpdateReload());

		act(() => {
			fireVisibilityChange();
		});

		await vi.waitFor(() => expect(sw.update).toHaveBeenCalledTimes(1));
	});

	it("throttles update checks within the interval", async () => {
		const sw = stubServiceWorker({ controller: true });
		renderHook(() => useSwUpdateReload());

		act(() => {
			fireVisibilityChange();
		});
		await vi.waitFor(() => expect(sw.update).toHaveBeenCalledTimes(1));

		// Drugi check natychmiast po pierwszym — wstrzymany do upływu 30 min.
		act(() => {
			fireVisibilityChange();
		});
		expect(sw.update).toHaveBeenCalledTimes(1);
	});

	it("stops checking for updates after unmount", async () => {
		const sw = stubServiceWorker({ controller: true });
		const { unmount } = renderHook(() => useSwUpdateReload(reload));

		unmount();

		act(() => {
			fireVisibilityChange();
		});
		await Promise.resolve();
		expect(sw.update).not.toHaveBeenCalled();
	});

	it("is a no-op when service workers are unsupported", () => {
		// jsdom default: navigator.serviceWorker is undefined.
		expect(() => renderHook(() => useSwUpdateReload(reload))).not.toThrow();
		act(() => {
			fireVisibilityChange();
		});
		expect(reload).not.toHaveBeenCalled();
	});
});
