// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (#170):
// - AlbumsList pobiera GET /api/app/albums i renderuje kafelki (okładka, tytuł,
//   licznik zdjęć) w kolejności z API (newest-first po stronie serwera).
// - „Nowy album" otwiera dialog; tworzenie wymaga tytułu + ≥1 zdjęcia.
// - Dialog najpierw uploaduje pliki istniejącym pipeline'em (uploadImages →
//   cfImageIds), potem POST /api/app/albums; zero zdjęć blokuje submit.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, vi } from "vitest";
import { AlbumsList } from "./albums-list";

// Kafelki linkują do /app/albums/$id (TanStack Router) — w testach passthrough na <a>.
vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, className, children, ...rest }: Record<string, unknown> & { to: string }) => (
		<a href={to} className={className as string | undefined} {...(rest as object)}>
			{children as ReactNode}
		</a>
	),
}));

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

const sampleTiles = [
	{ id: "album-new", title: "Wakacje", photoCount: 3, videoCount: 0, coverImageId: "cf-1" },
	{ id: "album-old", title: "Święta", photoCount: 1, videoCount: 0, coverImageId: "cf-9" },
];

/** Mock fetch: GET /api/app/albums → lista; POST /api/app/albums → tworzony album. */
function mockAlbumsApi(tiles = sampleTiles) {
	return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
		if (init?.method === "POST" && url.includes("/api/app/albums")) {
			return Promise.resolve({
				ok: true,
				status: 201,
				json: () =>
					Promise.resolve({ data: { id: "album-created", title: "Nowy", photoCount: 1 } }),
			});
		}
		if (url.includes("/api/app/albums")) {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ data: tiles, meta: { imageAccountHash: "hash-1" } }),
			});
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
	});
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("AlbumsList", () => {
	it("renders tiles newest-first with cover, title and photo count", async () => {
		vi.stubGlobal("fetch", mockAlbumsApi());
		const Wrapper = createWrapper();
		render(
			<Wrapper>
				<AlbumsList />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Wakacje")).not.toBeNull();
		});
		expect(screen.getByText("Święta")).not.toBeNull();
		// Kafelek pokazuje liczbę zdjęć.
		expect(screen.getByText(/3/)).not.toBeNull();
		// Okładka buduje URL z CF Images (thumbnail).
		const cover = screen.getByRole("img", { name: /okładka wakacje/i });
		expect(cover.getAttribute("src")).toContain("imagedelivery.net/hash-1/cf-1");
	});

	it("renders the create button as icon-only plus (mirror of Dodaj wideo, reviza usera)", async () => {
		vi.stubGlobal("fetch", mockAlbumsApi());
		const Wrapper = createWrapper();
		render(
			<Wrapper>
				<AlbumsList />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /nowy album/i })).not.toBeNull();
		});
		const button = screen.getByRole("button", { name: /nowy album/i });
		// Dostępna nazwa z title, treść = sama ikona Plus (bez tekstu).
		expect(button.textContent).toBe("");
		// Ikona MUSI mieć klasę typu size-* — shadcn Button wymusza size-4 na svg
		// bez takiej klasy ([&_svg:not([class*='size-'])]:size-4) i 1.5x nie działa.
		const icon = button.querySelector("svg");
		expect(icon?.getAttribute("class")).toContain("size-6");
	});

	it("shows an empty state with a create hint when there are no albums", async () => {
		vi.stubGlobal("fetch", mockAlbumsApi([]));
		const Wrapper = createWrapper();
		render(
			<Wrapper>
				<AlbumsList />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText(/nie masz jeszcze albumów/i)).not.toBeNull();
		});
		expect(screen.getByRole("button", { name: /nowy album/i })).not.toBeNull();
	});
});

// #172: kafelki pokazują „X zdjęć · Y wideo"; część z wideo znika przy 0.
describe("AlbumsList — liczniki per kind (#172)", () => {
	it("shows photo and video counts on the tile", async () => {
		vi.stubGlobal(
			"fetch",
			mockAlbumsApi([
				{ id: "a1", title: "Miks", photoCount: 3, videoCount: 1, coverImageId: "cf-1" },
			]),
		);
		render(<AlbumsList />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText(/3 zdjęć · 1 wideo/)).not.toBeNull();
		});
	});

	it("hides the video part when the album has no videos", async () => {
		vi.stubGlobal(
			"fetch",
			mockAlbumsApi([
				{ id: "a2", title: "Tylko zdjęcia", photoCount: 2, videoCount: 0, coverImageId: "cf-2" },
			]),
		);
		render(<AlbumsList />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText(/2 zdjęć/)).not.toBeNull();
		});
		expect(screen.queryByText(/wideo/)).toBeNull();
	});
});
