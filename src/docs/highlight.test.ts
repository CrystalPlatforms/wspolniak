// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Wrapper Shiki (F3 #206).
 *
 * Założenia zakodowane w testach:
 * - Moduł `shiki` jest importowany DYNAMICZNIE i tylko przy pierwszym highlight
 *   (lazy) — dokument bez bloków kodu nie ściąga Shiki do klienta. Mockujemy moduł
 *   `shiki` (granica systemu: ciężka biblioteka) i liczymy wywołania createHighlighter.
 * - Highlighter jest singletonem — N kolejnych highlightCode tworzy go RAZ
 *   (fine-grained bundle: 4 języki, 2 motywy, engine JS bez WASM).
 * - Motywy podążają za motywem apki: highlightCode(..., 'light' | 'dark') przekłada
 *   się na defaultColor github-light/github-dark; oba motywy zawsze w pakiecie
 *   (dual-theme → przełączenie motywu apki nie wymaga ponownego podświetlania).
 * - hasCodeBlocks wykrywa fence'y ``` z językiem — to warunek lazy loadu na poziomie
 *   dokumentu.
 * - NIE testujemy tu: wyglądu wygenerowanego HTML (HITL), CodeBlock komponentu
 *   (code-block.test.tsx).
 */
import { hasCodeBlocks, highlightCode, isShikiLang, SHIKI_THEMES } from "./highlight";

const { createHighlighterMock, codeToHtmlMock } = vi.hoisted(() => {
	const codeToHtml = vi.fn(async () => "<pre class=shiki>html</pre>");
	const createHighlighter = vi.fn(async () => ({ codeToHtml }));
	return { createHighlighterMock: createHighlighter, codeToHtmlMock: codeToHtml };
});

vi.mock("shiki", () => ({
	createHighlighter: createHighlighterMock,
}));

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

describe("highlightCode — lazy load i motywy", () => {
	it("bez wywołania highlightCode moduł shiki NIE jest w ogóle ładowany", () => {
		// Wyłącznie hasCodeBlocks/isShikiLang (ścieżki bez shiki) — brak importu.
		hasCodeBlocks("tekst");
		isShikiLang("ts");

		expect(createHighlighterMock).not.toHaveBeenCalled();
	});

	it("pierwsze highlightCode dynamicznie importuje shiki i tworzy highlighter z 4 językami i 2 motywami", async () => {
		const html = await highlightCode("const x = 1;", "ts", "light");

		expect(html).toContain("shiki");
		expect(createHighlighterMock).toHaveBeenCalledTimes(1);
		expect(createHighlighterMock).toHaveBeenCalledWith({
			themes: ["github-light", "github-dark"],
			langs: ["ts", "tsx", "bash", "json"],
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
