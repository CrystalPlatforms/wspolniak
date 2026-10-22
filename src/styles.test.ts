// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * iOS Safari przy focusie pola tekstowego o font-size < 16px auto-zoomuje
 * ekran do tego pola (issue #224). Globalny arkusz musi tego gwarantowanie
 * zabraniać — dla WSZYSTKICH pól tekstowych (input/textarea/select oraz
 * contenteditable), bo klasa Tailwind (np. text-sm) ma wyższą specyficzność
 * niż selektor typu i bez !important wygrywa.
 *
 * Granica testu: sam arkusz (jsdom nie liczy kaskady CSS). Normalizujemy
 * whitespace, żeby test przeżył reformater.
 */
const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf-8").replace(/\s+/g, " ");

/** Wyciąga ciało bloku @supports (-webkit-touch-callout: none) — hack na iOS WebKit. */
function iosGuardBlock(): string {
	const marker = "@supports (-webkit-touch-callout: none)";
	const start = css.indexOf(marker);
	if (start === -1) return "";
	const bodyStart = css.indexOf("{", start);
	let depth = 0;
	for (let i = bodyStart; i < css.length; i++) {
		if (css[i] === "{") depth++;
		if (css[i] === "}") {
			depth--;
			if (depth === 0) return css.slice(bodyStart + 1, i);
		}
	}
	return "";
}

describe("globalny arkusz — blokada auto-zoomu iOS przy focusie inputa", () => {
	it("guard istnieje i celuje w iOS WebKit (@supports -webkit-touch-callout)", () => {
		expect(iosGuardBlock()).not.toBe("");
	});

	it("guard obejmuje każde edytowalne pole: input, textarea, select i contenteditable", () => {
		const guard = iosGuardBlock();
		for (const selector of ["input", "textarea", "select", "[contenteditable]"]) {
			expect(guard).toContain(selector);
		}
	});

	it("guard gwarantuje minimum 16px (max(16px, 1em)) z !important — przebija klasy Tailwind", () => {
		expect(iosGuardBlock()).toContain("font-size: max(16px, 1em) !important");
	});

	it("viewport meta nie blokuje pinch-zoom (bez maximum-scale / user-scalable)", () => {
		const root = readFileSync(resolve(import.meta.dirname, "routes/__root.tsx"), "utf-8");
		const viewportMeta = root.match(/name: "viewport",\s*content: "([^"]+)"/)?.[1] ?? "";
		expect(viewportMeta).not.toContain("maximum-scale");
		expect(viewportMeta).not.toContain("user-scalable");
	});
});
