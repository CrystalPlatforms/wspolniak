// SPDX-License-Identifier: AGPL-3.0-or-later
// Wrapper Shiki (F3 #206, dieta #247): moduł shiki jest dynamicznie importowany TYLKO
// gdy trzeba podświetlić kod — dokument bez bloków kodu nigdy nie ściąga Shiki do
// klienta. Fine-grained build PRAWDZIWIE: shiki/core + silnik JavaScript (bez WASM,
// który w full bundle waży ~600 KB) + dokładnie 4 gramatyki (@shikijs/langs/*) i
// 2 motywy (@shikijs/themes/*) — zamiast pełnego bundla (~9 MB gramatyk na dysku,
// WASM w przeglądarce). Przed hydratacją bloki kodu mają prosty <pre>.

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

let highlighterPromise: Promise<import("shiki/core").HighlighterCore> | null = null;

async function getHighlighter(): Promise<import("shiki/core").HighlighterCore> {
	highlighterPromise ??= (async () => {
		const [
			{ createHighlighterCore },
			{ createJavaScriptRegexEngine },
			typescript,
			tsx,
			bash,
			json,
			githubLight,
			githubDark,
		] = await Promise.all([
			import("shiki/core"),
			import("shiki/engine/javascript"),
			import("@shikijs/langs/typescript"),
			import("@shikijs/langs/tsx"),
			import("@shikijs/langs/bash"),
			import("@shikijs/langs/json"),
			import("@shikijs/themes/github-light"),
			import("@shikijs/themes/github-dark"),
		]);
		return createHighlighterCore({
			themes: [githubLight.default, githubDark.default],
			langs: [typescript.default, tsx.default, bash.default, json.default],
			engine: createJavaScriptRegexEngine({ forgiving: true }),
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
