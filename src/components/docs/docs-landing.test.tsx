// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Docs landing (F1 #204).
 *
 * Założenia zakodowane w testach:
 * - Landing renderuje dokładnie trzy karty działów (Produkt / Techniczna / Błędy)
 *   na podstawie DOC_DEPARTMENT_META — kolejność wynika z tej listy.
 * - Karta działu z treścią jest linkiem do PIERWSZEGO dokumentu (alfabetycznie po
 *   slugu z listDocs); karta bez treści jest nieklikalna z plakietką „Wkrótce".
 *   Stan od F4 (#207): Produkt → /product/feed-and-posts, Techniczna →
 *   /technical/architecture, Błędy → /bugs/big-photo — każda karta linkuje
 *   pierwszy dokument SWOJEGO działu.
 * - Duże logo swapuje wariant PNG wg motywu (owner podmienił pliki na .png): ciemny → wspolniak-docs.png (biały
 *   napis na czerni), jasny → wspolniak-docs-light.png. SSR (bez resolvedTheme)
 *   renderuje wariant ciemny.
 * - Karty działów mają sam label (bez opisów — decyzja właściciela 2026-10-02).
 * - „Powrót do Wspólniaka" prowadzi na GŁÓWNY host apki (useAppHref → pełny URL,
 *   np. http://localhost:3000/app): cookie sesji nie jest współdzielony z docs.*,
 *   router Link zostawiłby usera w subdomenie bez sesji.
 * - NIE testujemy tu: stylowania (HITL), rzeczywistego wczytywania obrazka.
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

const useThemeMock = vi.hoisted(() =>
	vi.fn<() => { resolvedTheme?: "light" | "dark" }>(() => ({ resolvedTheme: "dark" })),
);

vi.mock("@/components/theme/theme-provider", () => ({
	useTheme: useThemeMock,
}));

function renderInRouter(ui: ReactNode) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const root = createRootRoute({
		component: () => <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
	});
	const landingRoute = createRoute({
		getParentRoute: () => root,
		path: "/",
		component: () => null,
	});
	const appRoute = createRoute({
		getParentRoute: () => root,
		path: "/app",
		component: () => null,
	});
	const productRoute = createRoute({
		getParentRoute: () => root,
		path: "/product/$slug",
		component: () => null,
	});
	const technicalRoute = createRoute({
		getParentRoute: () => root,
		path: "/technical/$slug",
		component: () => null,
	});
	const router = createRouter({
		routeTree: root.addChildren([landingRoute, appRoute, productRoute, technicalRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	return render(<RouterProvider router={router as never} />);
}

// Import po mocku — DocsLanding czyta zmockowany useTheme w czasie renderu.
import { DocsLanding } from "./docs-landing";

describe("DocsLanding", () => {
	beforeEach(() => {
		useThemeMock.mockReturnValue({ resolvedTheme: "dark" });
	});

	it("renderuje trzy karty działów: Produkt, Techniczna, Błędy", async () => {
		renderInRouter(<DocsLanding />);

		expect(await screen.findByRole("heading", { name: "Produkt" })).toBeTruthy();
		expect(await screen.findByRole("heading", { name: "Techniczna" })).toBeTruthy();
		expect(await screen.findByRole("heading", { name: "Błędy" })).toBeTruthy();
	});

	it("karta Produkt linkuje do pierwszego dokumentu produktowego", async () => {
		renderInRouter(<DocsLanding />);

		const link = await screen.findByRole("link", { name: /Produkt/ });
		expect(link.getAttribute("href")).toBe("/product/feed-and-posts");
	});

	it("karta Błędy ma treść i linkuje do artykułu big-photo (F4 #207)", async () => {
		renderInRouter(<DocsLanding />);

		// Wszystkie trzy karty działów są linkami do PIERWSZEGO dokumentu swojego
		// działu — w tym Błędy do zmigrowanego artykułu.
		const links = await screen.findAllByRole("link");
		const hrefs = links.map((link) => link.getAttribute("href"));
		expect(hrefs).toContain("/bugs/big-photo");
		expect(screen.queryByText("Wkrótce")).toBeNull();
	});

	it("renderuje duże logo docsów i przycisk powrotu na GŁÓWNY host apki", async () => {
		renderInRouter(<DocsLanding />);

		const logo = await screen.findByAltText("Dokumentacja Wspólniaka");
		expect(logo.getAttribute("src")).toBe("/logos/wspolniak-docs.png");
		// Powrót prowadzi poza subdomenę docsów (cookie sesji nie jest współdzielony):
		// useAppHref po mount liczy pełny URL z originu karty (jsdom: localhost:3000).
		const backLink = await screen.findByRole("link", { name: /Powrót do Wspólniaka/ });
		await waitFor(() => expect(backLink.getAttribute("href")).toBe("http://localhost:3000/app"));
	});

	it("w jasnym motywie logo swapuje na wariant light", async () => {
		useThemeMock.mockReturnValue({ resolvedTheme: "light" });
		renderInRouter(<DocsLanding />);

		expect((await screen.findByAltText("Dokumentacja Wspólniaka")).getAttribute("src")).toBe(
			"/logos/wspolniak-docs-light.png",
		);
	});
});
