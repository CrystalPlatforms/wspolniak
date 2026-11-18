// SPDX-License-Identifier: AGPL-3.0-or-later

// Singleton defs refrakcji (#235, AC: filter defs exactly once per document,
// no per-element duplication) i grace'owy fallback bez canvas (jsdom).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ensureChromeFilter,
	ensureRefractionDefs,
	GLASS_REFRACTION_DEFS_ATTR,
	resetRefractionForTests,
} from "./glass-refraction";

describe("refraction defs singleton (#235)", () => {
	beforeEach(() => {
		resetRefractionForTests();
	});

	afterEach(() => {
		resetRefractionForTests();
	});

	it("creates exactly one defs container across repeated calls", () => {
		ensureRefractionDefs();
		ensureRefractionDefs();
		ensureRefractionDefs();
		expect(document.querySelectorAll(`svg[${GLASS_REFRACTION_DEFS_ATTR}]`)).toHaveLength(1);
	});

	it("without canvas (jsdom) ensureChromeFilter returns null and no filter nodes appear", () => {
		const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
		expect(ensureChromeFilter(56, 56, 28)).toBeNull();
		expect(document.querySelector(`svg[${GLASS_REFRACTION_DEFS_ATTR}]`)).toBeNull();
		spy.mockRestore();
	});

	it("reset removes the defs container and cache", () => {
		ensureRefractionDefs();
		resetRefractionForTests();
		expect(document.querySelector(`svg[${GLASS_REFRACTION_DEFS_ATTR}]`)).toBeNull();
	});
});
