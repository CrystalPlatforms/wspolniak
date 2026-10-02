// SPDX-License-Identifier: AGPL-3.0-or-later
// Sidebar dzialu docsow (F5 #208) — testy DepartmentLayout.
//
// Zalozenia zakodowane w testach:
// - Manifest jest zrodlem grup: sidebar pokazuje grupy i dokumenty z
//   getDepartmentManifest(department); tytuly dochodza z registry.
// - Aktywnosc jest router-driven: activeSlug -> defaultActive BranchedMenu
//   (atrybut data-active na przycisku aktywnego dokumentu).
// - Tryby sidebara (rozwiniety/ukryty) to maszyna stanow; aside jest ZAWSZE
//   zamontowany (animacja wsuwania), stan niesie atrybut data-mode na <aside>.
// - Powroty do apki/dokumentacji zyja w sidebarze nad Credits (przeniesione
//   z DocPage wg ownera).
// - ThemeToggle jest mockowany (radix dropdown ma wlasne testy w apce); tu
//   sprawdzamy tylko JEGO OBECNOSC nad Credits.
// - Drawer: jsdom nie liczy breakpointow CSS, wiec testujemy maszyne stanow
//   (otwarcie hamburgerem, zamkniecie po wyborze dokumentu); wizualny breakpoint
//   lg: zostaje na HITL design review.
// - ResizeObserver nie istnieje w jsdom — stub (vendored komponent uzywa go do
//   pozycjonowania markera aktywnej galezi).
// - NIE testujemy tu: animacji galezi CSS (HITL), kolorow motywu.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { DepartmentLayout } from "./department-layout";

// Router przy nawigacji woła window.scrollTo — jsdom go nie implementuje.
window.scrollTo = () => {};

vi.mock("@/components/theme/theme-provider", () => ({
	useTheme: () => ({ resolvedTheme: "dark" }),
}));

vi.mock("@/components/theme/theme-toggle", () => ({
	ThemeToggle: (props: { showLabel?: boolean }) => (
		<div data-testid="theme-toggle" data-show-label={props.showLabel ? "true" : undefined} />
	),
}));

class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

function renderInRouter(ui: ReactNode, initialPath: string) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const root = createRootRoute({
		component: () => <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
	});
	const product = createRoute({
		getParentRoute: () => root,
		path: "/product/$slug",
		component: Outlet,
	});
	const technical = createRoute({
		getParentRoute: () => root,
		path: "/technical/$slug",
		component: Outlet,
	});
	const bugs = createRoute({ getParentRoute: () => root, path: "/bugs/$slug", component: Outlet });
	const credits = createRoute({
		getParentRoute: () => root,
		path: "/credits",
		component: () => null,
	});
	const home = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
	const router = createRouter({
		routeTree: root.addChildren([product, technical, bugs, credits, home]),
		history: createMemoryHistory({ initialEntries: [initialPath] }),
	});
	render(<RouterProvider router={router as never} />);
	return router;
}

describe("DepartmentLayout (sidebar F5 #208)", () => {
	it("renderuje grupe i dokumenty z manifestu (produkt)", async () => {
		renderInRouter(
			<DepartmentLayout department="product">tresc</DepartmentLayout>,
			"/product/feed-and-posts",
		);

		expect(await screen.findByText("Posty i multimedia")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Feed i posty — podstawy" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Dodawanie zdjęć i wideo" })).toBeTruthy();
	});

	it("renderuje grupe i dokumenty z manifestu (techniczna)", async () => {
		renderInRouter(
			<DepartmentLayout department="technical">tresc</DepartmentLayout>,
			"/technical/stack",
		);

		expect(await screen.findByText("Platforma")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Stack technologiczny" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Architektura i warstwy" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Deploy i migracje" })).toBeTruthy();
	});

	it("renderuje grupe i dokumenty z manifestu (bledy)", async () => {
		renderInRouter(<DepartmentLayout department="bugs">tresc</DepartmentLayout>, "/bugs/big-photo");

		expect(await screen.findByText("Znane problemy")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Zdjęcie przekracza dozwolony rozmiar pliku" }),
		).toBeTruthy();
	});

	it("aktywny dokument jest podswietlony (data-active z activeSlug)", async () => {
		renderInRouter(
			<DepartmentLayout department="product" activeSlug="uploading-photos">
				tresc
			</DepartmentLayout>,
			"/product/uploading-photos",
		);

		await screen.findByText("Posty i multimedia");
		const active = screen.getByRole("button", { name: "Dodawanie zdjęć i wideo" });
		expect(active.getAttribute("data-active")).toBe("");
	});

	it("wybor dokumentu nawiguje routerem", async () => {
		const router = renderInRouter(
			<DepartmentLayout department="product" activeSlug="uploading-photos">
				tresc
			</DepartmentLayout>,
			"/product/uploading-photos",
		);

		await screen.findByText("Posty i multimedia");
		await userEvent.click(screen.getByRole("button", { name: "Feed i posty — podstawy" }));

		await waitFor(() => expect(router.state.location.pathname).toBe("/product/feed-and-posts"));
	});

	it("hamburger otwiera drawer, wybor dokumentu go zamyka (maszyna stanow mobile)", async () => {
		const router = renderInRouter(
			<DepartmentLayout department="bugs" activeSlug="big-photo">
				tresc
			</DepartmentLayout>,
			"/bugs/big-photo",
		);

		await screen.findByText("Znane problemy");
		expect(screen.queryByRole("dialog", { name: "Nawigacja dokumentacji" })).toBeNull();

		await userEvent.click(screen.getByRole("button", { name: "Otwórz nawigację dokumentacji" }));
		expect(screen.getByRole("dialog", { name: "Nawigacja dokumentacji" })).toBeTruthy();

		await userEvent.click(
			within(screen.getByRole("dialog", { name: "Nawigacja dokumentacji" })).getByRole("button", {
				name: "Zdjęcie przekracza dozwolony rozmiar pliku",
			}),
		);

		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Nawigacja dokumentacji" })).toBeNull();
			expect(router.state.location.pathname).toBe("/bugs/big-photo");
		});
	});

	it("logo linkuje do landinga docsow, credits link jest w kazdym dziale", async () => {
		for (const department of ["product", "technical", "bugs"] as const) {
			renderInRouter(
				<DepartmentLayout department={department}>tresc</DepartmentLayout>,
				"/product/feed-and-posts",
			);

			// W DOM są jednocześnie topbar (mobile) i aside (desktop) — oba muszą
			// linkować logo do landinga i mieć credits na dole.
			const logoImgs = await screen.findAllByAltText("Dokumentacja Wspólniaka");
			expect(logoImgs.length).toBeGreaterThan(0);
			for (const img of logoImgs) {
				expect(img.closest("a")?.getAttribute("href")).toBe("/");
			}
			const creditsLinks = await screen.findAllByRole("link", { name: "Twórcy" });
			expect(creditsLinks.length).toBeGreaterThan(0);
			for (const credits of creditsLinks) {
				expect(credits.getAttribute("href")).toBe("/credits");
			}

			cleanup();
		}
	});

	it("Ukryj sidebar chowa kolumnę animacją (data-mode), Pokaż sidebar przywraca", async () => {
		renderInRouter(
			<DepartmentLayout department="product">tresc</DepartmentLayout>,
			"/product/feed-and-posts",
		);

		await screen.findByText("Posty i multimedia");
		// Aside jest zawsze zamontowany (animacja wsuwania) — stan niesie data-mode.
		const aside = document.querySelector("aside[data-mode]");
		expect(aside?.getAttribute("data-mode")).toBe("expanded");

		await userEvent.click(screen.getByRole("button", { name: "Ukryj sidebar" }));
		expect(aside?.getAttribute("data-mode")).toBe("hidden");
		// DWA przyciski przywrocenia (gor + dol), oba przywracaja sidebar.
		const restoreButtons = screen.getAllByRole("button", { name: "Pokaż sidebar" });
		expect(restoreButtons.length).toBe(2);

		await userEvent.click(restoreButtons[0]);
		expect(aside?.getAttribute("data-mode")).toBe("expanded");
	});

	it("ThemeToggle z napisem aktualnego trybu jest nad Credits", async () => {
		renderInRouter(
			<DepartmentLayout department="product">tresc</DepartmentLayout>,
			"/product/feed-and-posts",
		);

		// showLabel — ThemeToggle renderuje etykiete aktualnego trybu (Jasny/Ciemny/
		// Systemowy); sam napis testuje theme-toggle, tu sprawdzamy przekazanie propa.
		const toggle = await screen.findByTestId("theme-toggle");
		expect(toggle.getAttribute("data-show-label")).toBe("true");
	});

	it("powroty do apki i dokumentacji zyja w sidebarze (nad Credits)", async () => {
		renderInRouter(
			<DepartmentLayout department="product">tresc</DepartmentLayout>,
			"/product/feed-and-posts",
		);

		await screen.findByText("Posty i multimedia");
		await waitFor(() =>
			expect(screen.getByRole("link", { name: /Powrót do Wspólniaka/ }).getAttribute("href")).toBe(
				"http://localhost:3000/app",
			),
		);
		await waitFor(() =>
			expect(
				screen
					.getByRole("link", { name: /Powrót do strony głównej dokumentacji/ })
					.getAttribute("href"),
			).toBe("http://docs.localhost:3000/"),
		);
		expect(screen.getByRole("link", { name: "Twórcy" })).toBeTruthy();
	});

	it("przełącznik działów pod logiem nawiguje do wybranego działu", async () => {
		const router = renderInRouter(
			<DepartmentLayout department="product">tresc</DepartmentLayout>,
			"/product/feed-and-posts",
		);

		const trigger = await screen.findByRole("button", { name: /Produkt/ });
		await userEvent.click(trigger);
		await userEvent.click(screen.getByRole("menuitem", { name: /Techniczna/ }));

		await waitFor(() => expect(router.state.location.pathname).toBe("/technical/stack"));
	});
});
