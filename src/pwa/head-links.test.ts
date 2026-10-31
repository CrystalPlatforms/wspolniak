// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pwaIconLinks } from "./head-links";

const PUBLIC_DIR = resolve(__dirname, "../../public");

// GH #228: iOS kluczuje ikonę ekranu głównego per URL i nie odświeża jej po
// ponownym dodaniu PWA. Linki muszą więc wskazywać istniejące pliki i być
// wersjonowane query (?v=), a podbicie wersji = nowy URL = świeże pobranie.
describe("pwaIconLinks (GH #228)", () => {
	it("to linki apple-touch-icon z wersjonowanym URL-em (?v=)", () => {
		expect(pwaIconLinks.length).toBeGreaterThan(0);
		for (const link of pwaIconLinks) {
			expect(link.rel).toBe("apple-touch-icon");
			expect(link.href.startsWith("/")).toBe(true);
			expect(link.href).toMatch(/\?v=\d+$/);
		}
	});

	it("wskazują pliki, które istnieją w public/", () => {
		for (const link of pwaIconLinks) {
			const file = link.href.split("?")[0];
			expect(file).toBeTruthy();
			const relative = file?.replace(/^\//, "") ?? "";
			expect(existsSync(resolve(PUBLIC_DIR, relative))).toBe(true);
		}
	});

	it("wariant dark jest pierwszy (z media query), zwykły ostatni (bez media)", () => {
		const first = pwaIconLinks[0];
		const last = pwaIconLinks[pwaIconLinks.length - 1];
		expect(first?.href).toContain("apple-touch-icon-dark.png");
		expect(first?.media).toBe("(prefers-color-scheme: dark)");
		expect(last?.href).toContain("/apple-touch-icon.png");
		expect(last?.media).toBeUndefined();
	});
});
