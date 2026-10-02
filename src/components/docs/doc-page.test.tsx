// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Współdzielona strona dokumentu (F1 #204 dla produktu, F3 #206 dla technicznego).
 *
 * Założenia zakodowane w testach:
 * - DocPage jest content-agnostic: działa dla KAŻDEGO działu — product i technical
 *   są tu parametryzowane realnymi dokumentami z registry, więc test pilnuje też,
 *   że authored Markdown przechodzi przez renderer bez wywowania strony.
 * - Strona dokumentu pokazuje tytuł (h1) i przynajmniej jeden nagłówek sekcji (h2)
 *   z treści; breadcrumb eksponuje label działu z metadanych.
 * - doc = null → stan „nie znaleziono dokumentu" (wewnątrz DocPage, nie globalny
 *   NotFound — dokument docelowo jest linkowany, a błędny slug nie powinien zabierać
 *   całego layoutu).
 * - NIE testujemy tu: stylowania (HITL), mapowania anchorów (markdown.test.tsx).
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
import type { ReactNode } from "react";
import { getDoc } from "@/docs/registry";
import { DocPage } from "./doc-page";

vi.mock("@/components/theme/theme-provider", () => ({
	useTheme: () => ({ resolvedTheme: "dark" }),
}));

function renderInRouter(ui: ReactNode) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const root = createRootRoute({
		component: () => <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
	});
	const appRoute = createRoute({ getParentRoute: () => root, path: "/app", component: () => null });
	const homeRoute = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
	const router = createRouter({
		routeTree: root.addChildren([appRoute, homeRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	const view = render(<RouterProvider router={router as never} />);
	return view.container;
}

describe("DocPage", () => {
	it("renderuje dokument produktowy: tytuł, sekcje i pełny breadcrumb", async () => {
		const doc = getDoc("product", "feed-and-posts");
		expect(doc).not.toBeNull();

		renderInRouter(<DocPage department="product" doc={doc} />);

		expect(
			await screen.findByRole("heading", { level: 1, name: "Feed i posty — podstawy" }),
		).toBeTruthy();
		expect(
			await screen.findByRole("heading", { level: 2, name: "Przeglądanie feedu" }),
		).toBeTruthy();

		// Breadcrumb: Wspólniak > Dokumentacja > Produkt > artykuł.
		const nav = screen.getByRole("navigation", { name: "Ścieżka" });
		expect(nav.textContent).toContain("Dokumentacja");
		expect(nav.textContent).toContain("Produkt");
		const docsLink = nav.querySelector('a[href="http://docs.localhost:3000/"]');
		expect(docsLink?.textContent).toBe("Dokumentacja");

		// Przyciski powrotu żyją w sidebarze (department-layout.test.tsx) — tutaj
		// breadcrumb nadal linkuje międzyhostowo: dokumentacja na docs.*.
		await waitFor(() => {
			expect(nav.querySelector('a[href="http://docs.localhost:3000/"]')).not.toBeNull();
		});
	});

	it("renderuje dokument techniczny z blokiem kodu (F3) przez ten sam komponent", async () => {
		const doc = getDoc("technical", "stack");
		expect(doc).not.toBeNull();

		const container = renderInRouter(<DocPage department="technical" doc={doc} />);

		expect(
			await screen.findByRole("heading", { level: 1, name: "Stack technologiczny" }),
		).toBeTruthy();
		// Blok kodu istnieje w treści — renderer wstawia go jako <pre> (przed Shiki
		// lub z Shiki; obie ścieżki mają <pre> w wyjściu).
		await waitFor(() => expect(container.querySelector("pre")).not.toBeNull());
	});

	it("null doc → stan nie znaleziono zamiast wywalenia strony", async () => {
		renderInRouter(<DocPage department="product" doc={null} />);

		expect(await screen.findByText("Nie znaleziono dokumentu")).toBeTruthy();
	});

	it("dzial Bledy (F4 #207): notatka dla rodziny nad trescia i struktura objaw/przyczyna/rozwiazanie", async () => {
		const doc = getDoc("bugs", "big-photo");
		expect(doc).not.toBeNull();

		renderInRouter(<DocPage department="bugs" doc={doc} />);

		expect(
			await screen.findByRole("heading", {
				level: 1,
				name: "Zdjęcie przekracza dozwolony rozmiar pliku",
			}),
		).toBeTruthy();
		// Struktura developer-style: objaw -> przyczyna -> rozwiazanie.
		expect(screen.getByRole("heading", { level: 2, name: "Objaw" })).toBeTruthy();
		expect(screen.getByRole("heading", { level: 2, name: "Przyczyna" })).toBeTruthy();
		expect(screen.getByRole("heading", { level: 2, name: /Rozwiązanie/ })).toBeTruthy();

		// Notatka dla rodziny (konsola -> admin) istnieje i jest NAD trescia artykulu.
		const note = screen.getByText(/Skopiuj treść błędu z konsoli/).closest("aside");
		if (!note) throw new Error("Notatka dla rodziny nie jest w <aside>");
		const symptom = screen.getByRole("heading", { name: "Objaw" });
		expect(note.compareDocumentPosition(symptom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});
