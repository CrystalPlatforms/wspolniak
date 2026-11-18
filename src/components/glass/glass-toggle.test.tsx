// SPDX-License-Identifier: AGPL-3.0-or-later

// Przełącznik „Efekt szklany (Wspólniak Glass)" (#234): stan Switcha odzwierciedla
// kontekst, przełączenie zapisuje preferencję i od razu przełącza atrybut roota.

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GLASS_ATTRIBUTE, GLASS_STORAGE_KEY, GlassProvider } from "./glass-provider";
import { GlassToggle } from "./glass-toggle";

describe("GlassToggle (#234)", () => {
	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.removeAttribute("data-glass");
	});

	afterEach(() => {
		document.documentElement.removeAttribute("data-glass");
	});

	it("renders ON by default with the exact label", () => {
		render(
			<GlassProvider>
				<GlassToggle />
			</GlassProvider>,
		);
		const toggle = screen.getByRole("switch", { name: "Efekt szklany (Wspólniak Glass)" });
		expect(toggle.getAttribute("aria-checked")).toBe("true");
	});

	it("flipping persists the preference and flips the root attribute instantly", () => {
		render(
			<GlassProvider>
				<GlassToggle />
			</GlassProvider>,
		);
		const toggle = screen.getByRole("switch", { name: "Efekt szklany (Wspólniak Glass)" });
		fireEvent.click(toggle);
		expect(window.localStorage.getItem(GLASS_STORAGE_KEY)).toBe("off");
		expect(document.documentElement.hasAttribute(GLASS_ATTRIBUTE)).toBe(false);
		fireEvent.click(toggle);
		expect(window.localStorage.getItem(GLASS_STORAGE_KEY)).toBe("on");
		expect(document.documentElement.getAttribute(GLASS_ATTRIBUTE)).toBe("on");
	});

	it("restores OFF from storage on mount", () => {
		window.localStorage.setItem(GLASS_STORAGE_KEY, "off");
		render(
			<GlassProvider>
				<GlassToggle />
			</GlassProvider>,
		);
		const toggle = screen.getByRole("switch", { name: "Efekt szklany (Wspólniak Glass)" });
		expect(toggle.getAttribute("aria-checked")).toBe("false");
	});
});
