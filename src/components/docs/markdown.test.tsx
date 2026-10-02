// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Współdzielony renderer Markdown (F2 #205).
 *
 * Założenia zakodowane w testach:
 * - Nagłówki dostają STABILNE id (slug PL→ASCII, np. „Zdjęcie jest za duże" →
 *   `zdjecie-jest-za-duze`), a treść nagłówka jest klikalną kotwicą href="#id".
 * - Duplikaty tytułów sekcji dostają sufiks -1, -2…; id NIE dryfują między
 *   re-renderami (Mapa usedIds jest świeża na render).
 * - Blockquote → callout (aside w języku wizualnym big-photo: bg-muted, ikona Info).
 * - Tabela GFM renderuje się jako <table> w przewijalnym wrapperze z obramowaniem.
 * - Listy mają klasy wypunktowania; linki zewnętrzne otwierają się w nowej karcie
 *   (target=_blank, rel=noopener), wewnętrzne idą przez router Link (href zostaje).
 * - NIE testujemy tu: stylowania inline (HITL), podświetlania kodu (code-block i
 *   highlight mają osobne testy).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { DocsMarkdown, slugifyHeading } from "./markdown";

vi.mock("@/components/theme/theme-provider", () => ({
	useTheme: () => ({ resolvedTheme: "dark" }),
}));

// Link (linki wewnętrzne w Markdown) wymaga kontekstu routera — render w mini-routerze.
// Router podmontowuje DOM asynchronicznie — czekamy na niepusty container.
async function renderMarkdown(content: string) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const root = createRootRoute({
		component: () => (
			<QueryClientProvider client={queryClient}>
				<DocsMarkdown content={content} />
			</QueryClientProvider>
		),
	});
	const route = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	const { container } = render(<RouterProvider router={router as never} />);
	await waitFor(() => expect(container.innerHTML).not.toBe(""));
	return container;
}

describe("slugifyHeading", () => {
	it("przepina polskie diakrytyki na ASCII", () => {
		expect(slugifyHeading("Zdjęcie jest za duże")).toBe("zdjecie-jest-za-duze");
		expect(slugifyHeading("Wczytywanie łóżka")).toBe("wczytywanie-lozka");
	});

	it("zostawia liczby i myślniki, wycina resztę", () => {
		expect(slugifyHeading("Upload 20 s (limit)")).toBe("upload-20-s-limit");
	});

	it("pusty slug pada na bezpieczny fallback", () => {
		expect(slugifyHeading("?!")).toBe("sekcja");
	});
});

describe("DocsMarkdown — nagłówki z kotwicami", () => {
	it("h2 dostaje id z treści i klikalną kotwicę href=#id", async () => {
		await renderMarkdown("## Przyczyna\n\nTreść sekcji.");

		const heading = screen.getByRole("heading", { level: 2, name: /Przyczyna/ });
		expect(heading.id).toBe("przyczyna");
		const anchor = heading.querySelector("a");
		expect(anchor?.getAttribute("href")).toBe("#przyczyna");
	});

	it("duplikaty sekcji dostają stabilne sufiksy foo, foo-1", async () => {
		await renderMarkdown("## Limit\n\na\n\n## Limit\n\nb");

		const headings = screen.getAllByRole("heading", { level: 2, name: "Limit" });
		expect(headings.map((heading) => heading.id)).toEqual(["limit", "limit-1"]);
	});
});

describe("DocsMarkdown — callout, tabele, listy, linki", () => {
	it("blockquote renderuje się jako callout aside w języku big-photo", async () => {
		await renderMarkdown("> **Uwaga:** treść callouta");

		const aside = screen.getByText(/treść callouta/).closest("aside");
		expect(aside?.className).toContain("bg-muted/50");
	});

	it("tabela GFM renderuje się jako table w przewijalnym wrapperze", async () => {
		await renderMarkdown("| Co | Limit |\n| --- | --- |\n| Zdjęcie | 19 MB |");

		const table = screen.getByRole("table");
		expect(table.closest("div")?.className).toContain("overflow-x-auto");
		expect(table.textContent).toContain("19 MB");
	});

	it("listy punktowane mają klasy wypunktowania", async () => {
		await renderMarkdown("- jeden\n- dwa");

		const list = screen.getByRole("list");
		expect(list.className).toContain("list-disc");
	});

	it("link zewnętrzny otwiera się w nowej karcie z rel=noopener", async () => {
		await renderMarkdown("[Dokumentacja YouTube](https://youtube.com/docs)");

		const link = screen.getByRole("link", { name: "Dokumentacja YouTube" });
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toContain("noopener");
	});

	it("link wewnętrzny renderuje href bez zmian (router Link)", async () => {
		await renderMarkdown("[Zdjęcia](/product/uploading-photos)");

		// Router Link renderuje <a> z tym samym hrefem — wystarczy asercja href.
		expect(screen.getByRole("link", { name: "Zdjęcia" }).getAttribute("href")).toBe(
			"/product/uploading-photos",
		);
	});

	it("inline code dostaje stylowany <code> w języku ustawień", async () => {
		await renderMarkdown("Otwórz `Ustawienia → Aparat` w telefonie.");

		const code = screen.getByText("Ustawienia → Aparat");
		expect(code.tagName).toBe("CODE");
	});
});
