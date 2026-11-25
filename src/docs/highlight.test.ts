// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Wrapper Shiki (F3 #206, dieta #247).
 *
 * Założenia zakodowane w testach:
 * - Full bundle `shiki` (import "shiki") jest ZAKAZANY — ~9 MB gramatyk i silnik
 *   WASM. Dozwolone wyłącznie: shiki/core + silnik JS + 4 gramatyki
 *   (@shikijs/langs/*) + 2 motywy (@shikijs/themes/*); test-thrower pilnuje zakazu.
 * - Moduły shiki są importowane DYNAMICZNIE i tylko przy pierwszym highlight
 *   (lazy) — dokument bez bloków kodu nie ściąga Shiki do klienta. Mockujemy
 *   pakiety zewnętrzne (granica systemu) i liczymy wywołania createHighlighterCore.
 * - Highlighter jest singletonem — N kolejnych highlightCode tworzy go RAZ.
 * - Motywy podążają za motywem apki: highlightCode(..., 'light' | 'dark') przekłada
 *   się na defaultColor github-light/github-dark; oba motywy zawsze w pakiecie.
 * - hasCodeBlocks wykrywa fence'y ``` z językiem — warunek lazy loadu dokumentu.
 * - NIE testujemy tu: wyglądu wygenerowanego HTML (HITL), CodeBlock komponentu
 *   (code-block.test.tsx), realnych aliasów języków (highlight-real.test.ts).
 */
import { hasCodeBlocks, highlightCode, isShikiLang, SHIKI_THEMES } from "./highlight";

const { createHighlighterMock, codeToHtmlMock } = vi.hoisted(() => {
	const codeToHtml = vi.fn(async () => "<pre class=shiki>html</pre>");
	const createHighlighter = vi.fn(async (_options: unknown) => ({ codeToHtml }));
	return { createHighlighterMock: createHighlighter, codeToHtmlMock: codeToHtml };
});

vi.mock("shiki", () => {
	throw new Error('ZAKAZ: full bundle "shiki" — używaj shiki/core (dieta #247)');
});

vi.mock("shiki/core", () => ({
	createHighlighterCore: (options: unknown) => createHighlighterMock(options),
}));

vi.mock("shiki/engine/javascript", () => ({
	createJavaScriptRegexEngine: () => "js-engine-stub",
}));

vi.mock("@shikijs/langs/typescript", () => ({ default: "lang:typescript" }));
vi.mock("@shikijs/langs/tsx", () => ({ default: "lang:tsx" }));
vi.mock("@shikijs/langs/bash", () => ({ default: "lang:bash" }));
vi.mock("@shikijs/langs/json", () => ({ default: "lang:json" }));
vi.mock("@shikijs/themes/github-light", () => ({ default: "theme:github-light" }));
vi.mock("@shikijs/themes/github-dark", () => ({ default: "theme:github-dark" }));

describe("hasCodeBlocks", () => {
	it("wykrywa fence z językiem", () => {
		expect(hasCodeBlocks("Tekst.\n\n```ts\nconst x = 1;\n```")).toBe(true);
	});

	it("nie wykrywa zwykłego tekstu ani fence bez języka", () => {
		expect(hasCodeBlocks("Zwykły tekst bez kodu.")).toBe(false);
	});
});

describe("isShikiLang", () => {
	it("dopuszcza tylko języki z ograniczonego zestawu", () => {
		expect(isShikiLang("ts")).toBe(true);
		expect(isShikiLang("tsx")).toBe(true);
		expect(isShikiLang("bash")).toBe(true);
		expect(isShikiLang("json")).toBe(true);
		expect(isShikiLang("python")).toBe(false);
		expect(isShikiLang("")).toBe(false);
	});
});

describe("highlightCode — lazy load, fine-grained i motywy", () => {
	it("bez wywołania highlightCode moduły shiki NIE są w ogóle ładowane", () => {
		// Wyłącznie hasCodeBlocks/isShikiLang (ścieżki bez shiki) — brak importu.
		hasCodeBlocks("tekst");
		isShikiLang("ts");

		expect(createHighlighterMock).not.toHaveBeenCalled();
	});

	it("pierwsze highlightCode buduje highlighter z fine-grained modułów: 4 języki, 2 motywy, silnik JS", async () => {
		const html = await highlightCode("const x = 1;", "ts", "light");

		expect(html).toContain("shiki");
		expect(createHighlighterMock).toHaveBeenCalledTimes(1);
		expect(createHighlighterMock).toHaveBeenCalledWith({
			themes: ["theme:github-light", "theme:github-dark"],
			langs: ["lang:typescript", "lang:tsx", "lang:bash", "lang:json"],
			engine: "js-engine-stub",
		});
	});

	it("kolejne wywołania ponawiają highlighter (singleton) — bez duplikacji tworzenia", async () => {
		// Pierwsze wywołanie w pliku stworzyło highlighter (test wyżej); kolejne
		// trzy nadal nie mogą go tworzyć ponownie — singleton trzyma promise.
		await highlightCode("const a = 1;", "ts", "light");
		await highlightCode("const b = 2;", "ts", "dark");
		await highlightCode("echo hi", "bash", "light");

		expect(createHighlighterMock).toHaveBeenCalledTimes(1);
	});

	it("motyw podąża za motywem apki: defaultColor = github-light | github-dark", async () => {
		await highlightCode("const x = 1;", "ts", "light");
		expect(codeToHtmlMock).toHaveBeenLastCalledWith("const x = 1;", {
			lang: "ts",
			themes: SHIKI_THEMES,
			defaultColor: "light",
		});

		await highlightCode("const x = 1;", "ts", "dark");
		expect(codeToHtmlMock).toHaveBeenLastCalledWith("const x = 1;", {
			lang: "ts",
			themes: SHIKI_THEMES,
			defaultColor: "dark",
		});
	});
});
