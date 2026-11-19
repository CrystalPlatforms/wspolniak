// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Założenia kodowane przez te testy (stan przed RED):
 * - SearchResults = prezentacyjny komponent wyników wyszukiwarki (dane podaje
 *   trasa /app/search po fetchu /api/search).
 * - Daty przychodzą jako stringi ISO (JSON z API), nie Date.
 * - Sekcje Posty / Komentarze / Albumy renderują się tylko gdy niepuste,
 *   linki: post → /app/post/$id, album → /app/albums/$id, komentarz → post.
 * - Router stubujemy na granicy (Link → <a>), bez jest-dom: asercje przez
 *   toBeNull/	textContent.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { SearchResults } from "./search-results";

// Router na granicy: Link → zwykły <a> z href z to/params.
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		params,
		children,
	}: {
		to: string;
		params?: Record<string, string>;
		children?: React.ReactNode;
	}) => (
		<a href={to.replace("$id", params?.id ?? "")} data-testid="router-link">
			{children}
		</a>
	),
}));

const POST = {
	id: "p1",
	description: "Wakacje nad morzem",
	authorName: "Mama",
	createdAt: "2026-09-01T12:00:00.000Z",
	cfImageId: null,
};

const COMMENT = {
	id: "k1",
	postId: "p1",
	body: "Piękny zachód słońca",
	authorName: "Tata",
	createdAt: "2026-09-02T12:00:00.000Z",
};

const ALBUM = {
	id: "a1",
	title: "Wakacje 2026",
	creatorName: "Mama",
	createdAt: "2026-09-03T12:00:00.000Z",
};

describe("SearchResults", () => {
	it("renderuje 4 taby z licznikami; domyślnie aktywny Posty z linkiem do posta", () => {
		const { container } = render(
			<SearchResults
				query="wakacje"
				posts={[POST]}
				comments={[]}
				albums={[ALBUM]}
				accountHash="hash"
			/>,
		);
		// Taby z licznikami — dokładnie 3: Posty, Albumy, Komentarze.
		expect(screen.getByRole("tab", { name: /Posty/ }).textContent).toContain("1");
		expect(screen.getByRole("tab", { name: /Albumy/ }).textContent).toContain("1");
		expect(screen.getByRole("tab", { name: /Komentarze/ }).textContent).toContain("0");
		expect(screen.getAllByRole("tab")).toHaveLength(3);
		// Domyślnie aktywny Posty: wynik posta widoczny z linkiem, album nie.
		expect(screen.getByText("Wakacje nad morzem")).not.toBeNull();
		const link = screen.getByRole("link", { name: /wakacje nad morzem/i });
		expect(link.getAttribute("href")).toBe("/app/post/p1");
		expect(screen.queryByText("Wakacje 2026")).toBeNull();
		// Taby zastępują nagłówki sekcji — zero <h2> w komponencie.
		expect(container.querySelector("h2")).toBeNull();
	});

	it("klik taba przełącza grupę (Albumy → kafel albumu, posty znikają)", () => {
		render(
			<SearchResults
				query="wakacje"
				posts={[POST]}
				comments={[]}
				albums={[ALBUM]}
				accountHash="hash"
			/>,
		);
		fireEvent.click(screen.getByRole("tab", { name: /Albumy/ }));
		expect(screen.getByText("Wakacje 2026")).not.toBeNull();
		const link = screen.getByRole("link", { name: /wakacje 2026/i });
		expect(link.getAttribute("href")).toBe("/app/albums/a1");
		expect(screen.queryByText("Wakacje nad morzem")).toBeNull();
	});

	it("tab Komentarze pokazuje fragment i autora", () => {
		render(
			<SearchResults
				query="zachód"
				posts={[]}
				comments={[COMMENT]}
				albums={[]}
				accountHash="hash"
			/>,
		);
		fireEvent.click(screen.getByRole("tab", { name: /Komentarze/ }));
		expect(screen.getByText(/Piękny zachód słońca/)).not.toBeNull();
		expect(screen.getByText(/Tata/)).not.toBeNull();
	});

	it("aktywny tab bez wyników → komunikat w obszarze wyników", () => {
		render(<SearchResults query="xyzzy" posts={[]} comments={[]} albums={[]} accountHash="hash" />);
		expect(screen.getByRole("tab", { name: /Posty/ })).not.toBeNull();
		expect(screen.getByText(/Nic nie znaleziono/)).not.toBeNull();
	});
});
