// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Test-lock na prawdziwe działanie highlightCode (#247): fine-grained gramatyki
 * (@shikijs/langs/*) muszą rozwiązywać aliasy języków z SHIKI_LANGS ("ts" →
 * typescript itd.) — bez mocków, na prawdziwym shiki/core + silniku JS.
 */
import { highlightCode } from "./highlight";

describe("highlightCode — realne podświetlanie (fine-grained)", () => {
	it("podświetla ts mimo aliasu", async () => {
		const html = await highlightCode("const a = 1;", "ts", "light");
		expect(html).toContain("shiki");
	});

	it("podświetla bash", async () => {
		const html = await highlightCode("echo cześć", "bash", "dark");
		expect(html).toContain("shiki");
	});

	it("podświetla json", async () => {
		const html = await highlightCode('{"a": 1}', "json", "light");
		expect(html).toContain("shiki");
	});
});
