// SPDX-License-Identifier: AGPL-3.0-or-later
import { render } from "@testing-library/react";
import { PwaShell } from "./pwa-shell";

function mockLocalStorage(): Storage {
	const store = new Map<string, string>();
	return {
		getItem: vi.fn((key: string) => store.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => store.set(key, value)),
		removeItem: vi.fn((key: string) => store.delete(key)),
		clear: vi.fn(() => store.clear()),
		key: vi.fn(),
		length: 0,
	} as unknown as Storage;
}

describe("PwaShell — rejestracja Service Workera (SW tylko na produkcji)", () => {
	let registerMock: ReturnType<typeof vi.fn>;
	let unregisterMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.stubGlobal("localStorage", mockLocalStorage());
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => ({
				matches: false,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			})),
		);

		registerMock = vi.fn().mockResolvedValue({});
		unregisterMock = vi.fn().mockResolvedValue(true);
		Object.defineProperty(navigator, "serviceWorker", {
			configurable: true,
			value: {
				register: registerMock,
				ready: new Promise(() => {}),
				getRegistrations: vi.fn(async () => [
					{ unregister: unregisterMock },
					{ unregister: unregisterMock },
				]),
			},
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		Object.defineProperty(navigator, "serviceWorker", {
			configurable: true,
			value: undefined,
		});
	});

	it("registers /sw.js on mount in production", async () => {
		vi.stubEnv("DEV", false);
		render(
			<PwaShell>
				<div>child</div>
			</PwaShell>,
		);

		// useEffect runs synchronously after commit in test env
		await Promise.resolve();
		expect(registerMock).toHaveBeenCalledWith("/sw.js");
	});

	it("unregisters stale workers in dev instead of registering (dev cache fix)", async () => {
		// Testy vitest działają w trybie DEV — tu właśnie ta gałąź się odpala.
		render(
			<PwaShell>
				<div>child</div>
			</PwaShell>,
		);

		await vi.waitFor(() => expect(unregisterMock).toHaveBeenCalledTimes(2));
		expect(registerMock).not.toHaveBeenCalled();
	});
});
