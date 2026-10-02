// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Blok kodu docsów (F3 #206).
 *
 * Założenia zakodowane w testach:
 * - Przed (lub bez) hydratacji z Shiki blok kodu to prosty stylowany <pre> — krótki
 *   błysk bez kolorów zaakceptowany w PRD; po podświetleniu HTML Shiki wchodzi
 *   jako dangerouslySetInnerHTML (wyjście biblioteki, nie user input).
 * - Shiki ładuje się LAZY: język poza zestawem SHIKI_LANGS (np. python albo brak
 *   języka) NIGDY nie wywołuje highlightCode, więc moduł shiki nie jest importowany.
 * - Motyw podświetlania podąża za useTheme().resolvedTheme — przełączenie motywu
 *   apki wywołuje ponowne podświetlenie z drugim defaultColor (dual-theme).
 * - Mock `shiki` jest granicą systemu (ciężka biblioteka + dynamic import); mock
 *   useTheme jest granicą providera motywu (w jsdom nie ma realnego system theme).
 * - NIE testujemy tu: stylowania (HITL), treści realnych dokumentów (doc-page).
 */
import { render, screen, waitFor } from "@testing-library/react";
import { CodeBlock } from "./code-block";

const highlightCodeMock = vi.hoisted(() => vi.fn(async () => "<pre class=shiki>kod</pre>"));

vi.mock("@/docs/highlight", () => ({
	isShikiLang: (lang: string) => ["ts", "tsx", "bash", "json"].includes(lang),
	highlightCode: highlightCodeMock,
}));

const resolvedThemeMock = vi.hoisted(() => vi.fn(() => "dark" as "dark" | "light" | undefined));

vi.mock("@/components/theme/theme-provider", () => ({
	useTheme: () => ({ resolvedTheme: resolvedThemeMock() }),
}));

describe("CodeBlock", () => {
	beforeEach(() => {
		highlightCodeMock.mockClear();
		resolvedThemeMock.mockReturnValue("dark");
	});

	it("od razu pokazuje prosty <pre> z kodem, potem podmienia na HTML Shiki", async () => {
		const { container } = render(<CodeBlock code={"const x = 1;"} lang="ts" />);

		// Zanim Shiki odpowie — prosty pre (SSR/flash):
		expect(container.querySelector("pre")).not.toBeNull();
		expect(screen.getByText("const x = 1;")).toBeTruthy();

		// Po podświetleniu — HTML z Shiki w kontenerze.
		await waitFor(() => expect(container.querySelector(".shiki")).not.toBeNull());
		expect(highlightCodeMock).toHaveBeenCalledWith("const x = 1;", "ts", "dark");
	});

	it("język poza zestawem SHIKI_LANGS nigdy nie ładuje Shiki — zostaje prosty pre", async () => {
		const { container } = render(<CodeBlock code="print('hi')" lang="python" />);

		expect(container.querySelector("pre")).not.toBeNull();
		// Efekt nie wywołał highlightCode nawet po przepłynięciu efektów:
		await waitFor(() => expect(highlightCodeMock).not.toHaveBeenCalled());
		expect(container.querySelector(".shiki")).toBeNull();
	});

	it("przełączenie motywu apki re-podświetla z drugim motywem", async () => {
		const { container, rerender } = render(<CodeBlock code={"const x = 1;"} lang="ts" />);
		await waitFor(() => expect(container.querySelector(".shiki")).not.toBeNull());

		resolvedThemeMock.mockReturnValue("light");
		rerender(<CodeBlock code={"const x = 1;"} lang="ts" />);

		await waitFor(() =>
			expect(highlightCodeMock).toHaveBeenLastCalledWith("const x = 1;", "ts", "light"),
		);
	});

	it("błąd podświetlania nie wywala strony — zostaje prosty pre", async () => {
		highlightCodeMock.mockRejectedValueOnce(new Error("shiki down"));
		const { container } = render(<CodeBlock code={"const x = 1;"} lang="ts" />);

		await waitFor(() => expect(highlightCodeMock).toHaveBeenCalled());
		expect(container.querySelector("pre")).not.toBeNull();
		expect(container.querySelector(".shiki")).toBeNull();
	});
});
