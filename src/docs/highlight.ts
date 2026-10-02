// SPDX-License-Identifier: AGPL-3.0-or-later
// Wrapper Shiki (F3 #206): moduł shiki jest dynamicznie importowany TYLKO gdy trzeba
// podświetlić kod — dokument bez bloków kodu nigdy nie ściąga Shiki do klienta.
// Fine-grained build: ograniczony zestaw języków i dwa motywy (jasny/ciemny apki),
// engine JavaScript (bez WASM). Przed hydratacją bloki kodu mają prosty <pre>.

/** Języki dozwolone w docsach — zgodnie z tworzonymi treściami (ts/tsx/bash/json). */
export const SHIKI_LANGS = ["ts", "tsx", "bash", "json"] as const;
export type ShikiLang = (typeof SHIKI_LANGS)[number];

export const SHIKI_THEMES = { light: "github-light", dark: "github-dark" } as const;

export function isShikiLang(lang: string): lang is ShikiLang {
	return (SHIKI_LANGS as readonly string[]).includes(lang);
}

/** Czy treść dokumentu zawiera jakiekolwiek bloki kodu (``` fence'y). */
export function hasCodeBlocks(content: string): boolean {
	return /^```\w/m.test(content);
}

let highlighterPromise: Promise<import("shiki").Highlighter> | null = null;

async function getHighlighter(): Promise<import("shiki").Highlighter> {
	highlighterPromise ??= (async () => {
		const { createHighlighter } = await import("shiki");
		return createHighlighter({
			themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
			langs: [...SHIKI_LANGS],
		});
	})();
	return highlighterPromise;
}

/**
 * Podświetla kod do HTML. Dual-theme (dwa motywy w jednym HTML, CSS var przełącza
 * ciemny), `defaultColor` ustawia bazowy motyw wg aktualnego motywu apki — dzięki
 * temu kolor bazowy jest poprawny od razu, a przełączenie motywu zmienia go bez
 * ponownego podświetlania.
 */
export async function highlightCode(
	code: string,
	lang: ShikiLang,
	theme: "light" | "dark",
): Promise<string> {
	const highlighter = await getHighlighter();
	return highlighter.codeToHtml(code, {
		lang,
		themes: SHIKI_THEMES,
		defaultColor: theme,
	});
}
