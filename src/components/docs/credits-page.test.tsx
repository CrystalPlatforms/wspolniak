// SPDX-License-Identifier: AGPL-3.0-or-later
// Strona /credits (F6 #209) — logo Crystal + tekst autorstwa.
//
// Zalozenia zakodowane w testach:
// - Tekst autorstwa jest dokladnie "Wspólniak został stworzony przez Crystal" (PRD,
//   story 13) i jest naglowkiem h1 strony.
// - Logo to /logos/CrystalLogo.png (jeden plik, bez wariantow motywu).
// - Powrot prowadzi na GLOWNY host apki (cookie sesji nie jest wspoldzielony z
//   docs.*) — pelny URL po mount, jak w DocPage.
// - Publicznosc (logged-out) to obserwacja HITL; tu sprawdzamy linki powrotu.
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
import { CreditsPage } from "./credits-page";

function renderInRouter(ui: ReactNode) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const root = createRootRoute({
		component: () => <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
	});
	const home = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
	const router = createRouter({
		routeTree: root.addChildren([home]),
		history: createMemoryHistory({ initialEntries: ["/credits"] }),
	});
	render(<RouterProvider router={router as never} />);
}

describe("CreditsPage", () => {
	it("renderuje logo Crystal i tekst autorstwa", async () => {
		renderInRouter(<CreditsPage />);

		expect(
			await screen.findByRole("heading", {
				level: 1,
				name: "Wspólniak został stworzony przez Crystal",
			}),
		).toBeTruthy();
		const logo = screen.getByAltText("Crystal");
		expect(logo.getAttribute("src")).toBe("/logos/CrystalLogo.png");
	});

	it("ma oba powroty na gorze: do apki i do dokumentacji (bez dolnego linku)", async () => {
		renderInRouter(<CreditsPage />);

		await screen.findByRole("heading", { level: 1 });
		await waitFor(() =>
			expect(screen.getByRole("link", { name: /Powrót do Wspólniaka/ }).getAttribute("href")).toBe(
				"http://localhost:3000/app",
			),
		);
		await waitFor(() =>
			expect(
				screen.getByRole("link", { name: /Powrót do dokumentacji/ }).getAttribute("href"),
			).toBe("http://docs.localhost:3000/"),
		);
		// Dolny link „Dokumentacja" zostal usuniety (poprawka ownera) — strona konczy
		// sie na tekscie autorstwa.
		expect(screen.queryByRole("link", { name: "Dokumentacja" })).toBeNull();
	});
});
