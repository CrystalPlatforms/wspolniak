// SPDX-License-Identifier: AGPL-3.0-or-later

// Testy rdzenia Wspólniak Glass (#234) — na granicy modułu: kontekst, atrybut
// roota i localStorage. Założenia kontraktu:
// - brak wpisu w localStorage = ON (default), "off" = OFF, śmieci = ON;
// - pierwszy render (hydratacja) zawsze default ON (SSR parity),
//   stored-OFF koryguje się w efekcie po mount;
// - host docs.* wymusza OFF niezależnie od zapisu.

import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	GLASS_ATTRIBUTE,
	GLASS_STORAGE_KEY,
	GlassProvider,
	isGlassExcludedHostname,
	readGlassPreference,
	useGlass,
} from "./glass-provider";

function Probe() {
	const { on } = useGlass();
	return <div data-testid="probe" data-on={on ? "1" : "0"} />;
}

describe("GlassProvider (#234)", () => {
	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.removeAttribute("data-glass");
	});

	afterEach(() => {
		document.documentElement.removeAttribute("data-glass");
	});

	it("first visit with empty storage resolves to ON", () => {
		render(
			<GlassProvider>
				<Probe />
			</GlassProvider>,
		);
		expect(screen.getByTestId("probe").dataset.on).toBe("1");
		expect(document.documentElement.getAttribute(GLASS_ATTRIBUTE)).toBe("on");
	});

	it("toggling persists to localStorage and sets/removes the root attribute", () => {
		function Controls() {
			const { on, setOn } = useGlass();
			return (
				<button type="button" onClick={() => setOn(!on)}>
					{on ? "on" : "off"}
				</button>
			);
		}
		render(
			<GlassProvider>
				<Controls />
			</GlassProvider>,
		);
		const button = screen.getByRole("button");
		expect(button.textContent).toBe("on");
		fireEvent.click(button);
		expect(button.textContent).toBe("off");
		expect(window.localStorage.getItem(GLASS_STORAGE_KEY)).toBe("off");
		expect(document.documentElement.hasAttribute(GLASS_ATTRIBUTE)).toBe(false);
		fireEvent.click(button);
		expect(window.localStorage.getItem(GLASS_STORAGE_KEY)).toBe("on");
		expect(document.documentElement.getAttribute(GLASS_ATTRIBUTE)).toBe("on");
	});

	it("restores stored OFF after remount (choice survives reload)", () => {
		window.localStorage.setItem(GLASS_STORAGE_KEY, "off");
		const first = render(
			<GlassProvider>
				<Probe />
			</GlassProvider>,
		);
		expect(screen.getByTestId("probe").dataset.on).toBe("0");
		first.unmount();
		render(
			<GlassProvider>
				<Probe />
			</GlassProvider>,
		);
		expect(screen.getByTestId("probe").dataset.on).toBe("0");
		expect(document.documentElement.hasAttribute(GLASS_ATTRIBUTE)).toBe(false);
	});

	it("SSR parity: server render identical for stored ON and OFF (no hydration mismatch)", () => {
		window.localStorage.setItem(GLASS_STORAGE_KEY, "off");
		const withOff = renderToString(
			<GlassProvider>
				<Probe />
			</GlassProvider>,
		);
		window.localStorage.clear();
		const withDefault = renderToString(
			<GlassProvider>
				<Probe />
			</GlassProvider>,
		);
		expect(withOff).toBe(withDefault);
	});

	it("OFF: no root attribute", () => {
		window.localStorage.setItem(GLASS_STORAGE_KEY, "off");
		render(
			<GlassProvider>
				<Probe />
			</GlassProvider>,
		);
		expect(document.documentElement.hasAttribute(GLASS_ATTRIBUTE)).toBe(false);
	});

	it("docs.* host is glass-excluded (pure rule)", () => {
		expect(isGlassExcludedHostname("docs.wspolniak.com")).toBe(true);
		expect(isGlassExcludedHostname("wspolniak.com")).toBe(false);
		expect(isGlassExcludedHostname("localhost")).toBe(false);
	});

	it("readGlassPreference defaults to ON and honors stored off", () => {
		expect(readGlassPreference()).toBe(true);
		window.localStorage.setItem(GLASS_STORAGE_KEY, "off");
		expect(readGlassPreference()).toBe(false);
	});
});
