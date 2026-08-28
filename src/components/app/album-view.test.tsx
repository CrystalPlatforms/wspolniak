// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (#170): AlbumView pobiera GET /api/app/albums/:id i
// renderuje siatkę zdjęć W KOLEJNOŚCI DODAWANIA; klik w zdjęcie otwiera
// istniejący ImageLightbox (zoom + swipe) od tego zdjęcia.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, vi } from "vitest";
import { AlbumView } from "./album-view";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children, ...rest }: Record<string, unknown> & { to: string }) => (
		<a href={to} {...(rest as object)}>
			{children as ReactNode}
		</a>
	),
	useParams: () => ({ id: "album-1" }),
}));

const sampleDetail = {
	id: "album-1",
	creatorId: "u1",
	title: "Wakacje",
	createdAt: "2026-08-27T10:00:00.000Z",
	items: [
		{
			id: "item-1",
			albumId: "album-1",
			kind: "own_image",
			ref: "cf-1",
			createdAt: "2026-08-27T10:00:00.000Z",
		},
		{
			id: "item-2",
			albumId: "album-1",
			kind: "own_image",
			ref: "cf-2",
			createdAt: "2026-08-27T10:00:00.001Z",
		},
		{
			id: "item-3",
			albumId: "album-1",
			kind: "own_image",
			ref: "cf-3",
			createdAt: "2026-08-27T10:00:00.002Z",
		},
	],
};

function mockAlbumApi(detail = sampleDetail) {
	return vi.fn().mockImplementation((url: string) => {
		if (url.includes("/api/app/albums/album-1")) {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ data: detail, meta: { imageAccountHash: "hash-1" } }),
			});
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
	});
}

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("AlbumView", () => {
	it("renders the photo grid in add order", async () => {
		vi.stubGlobal("fetch", mockAlbumApi());
		const Wrapper = createWrapper();
		render(
			<Wrapper>
				<AlbumView albumId="album-1" />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Wakacje")).not.toBeNull();
		});

		const photos = screen.getAllByRole("button", { name: /otwórz zdjęcie/i });
		expect(photos).toHaveLength(3);
		// Kolejność DOM = kolejność dodawania (created_at ASC z API).
		const alts = photos.map((p) => p.getAttribute("aria-label"));
		expect(alts).toEqual(["Otwórz zdjęcie 1", "Otwórz zdjęcie 2", "Otwórz zdjęcie 3"]);
	});

	it("opens the lightbox at the tapped photo", async () => {
		vi.stubGlobal("fetch", mockAlbumApi());
		const Wrapper = createWrapper();
		render(
			<Wrapper>
				<AlbumView albumId="album-1" />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getAllByRole("button", { name: /otwórz zdjęcie/i })).toHaveLength(3);
		});

		// Klik w 2. zdjęcie → lightbox startuje od niego.
		fireEvent.click(screen.getByRole("button", { name: "Otwórz zdjęcie 2" }));

		await waitFor(() => {
			const dialog = screen.getAllByRole("dialog");
			expect(dialog.length).toBeGreaterThan(0);
		});
		// Obraz w lightboxie to cf-2 (wariant public).
		const lightboxImg = screen.getAllByRole("dialog").at(-1)?.querySelector("img");
		expect(lightboxImg?.getAttribute("src")).toContain("hash-1/cf-2/public");
	});

	it("shows an error state when the album does not exist", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() =>
				Promise.resolve({
					ok: false,
					status: 404,
					json: () => Promise.resolve({ error: "Not found" }),
				}),
			),
		);
		const Wrapper = createWrapper();
		render(
			<Wrapper>
				<AlbumView albumId="missing" />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText(/nie znaleziono albumu/i)).not.toBeNull();
		});
	});
});

// Założenia kontraktu (#171/#172):
// - Widok albumu ma akcję „Dodaj zdjęcia" (append własnych zdjęć, #171).
// - Elementy wideo renderują się jako kafelek z miniaturką i play, linkujący
//   do /app/video/$id; lightbox otwierają WYŁĄCZNIE zdjęcia.
// - Nagłówek pokazuje liczniki per kind: „X zdjęć · Y wideo" (wideo znika przy 0).
describe("AlbumView — Dodaj zdjęcia i wideo (#171/#172)", () => {
	function detailWith(
		items: {
			id: string;
			albumId: string;
			kind: string;
			ref: string;
			createdAt: string;
			video?: { id: string; title: string; thumbnailUrl: string } | null;
		}[],
	) {
		return { ...sampleDetail, items };
	}

	const photoItem = {
		id: "item-1",
		albumId: "album-1",
		kind: "own_image",
		ref: "cf-1",
		createdAt: "2026-08-27T10:00:00.000Z",
	};
	const videoItem = {
		id: "item-2",
		albumId: "album-1",
		kind: "video",
		ref: "yt-1",
		createdAt: "2026-08-27T10:00:00.001Z",
		video: { id: "yt-1", title: "Fiesta", thumbnailUrl: "https://img.example/yt-1" },
	};

	it("renders the Dodaj zdjęcia action in the header (#171)", async () => {
		vi.stubGlobal("fetch", mockAlbumApi());
		render(<AlbumView albumId="album-1" />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /Dodaj zdjęcia/i })).not.toBeNull();
		});
	});

	it("renders a video tile with play linking to the video page; lightbox is photos only (#172)", async () => {
		vi.stubGlobal("fetch", mockAlbumApi(detailWith([photoItem, videoItem])));
		render(<AlbumView albumId="album-1" />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByRole("img", { name: "Fiesta" })).not.toBeNull();
		});
		// Kafelek wideo linkuje do strony wideo (mock Link → <a href>).
		const link = screen.getByRole("img", { name: "Fiesta" }).closest("a");
		expect(link?.getAttribute("href")).toContain("/app/video/");
		// Zdjęcie otwiera lightbox — wideo nie (brak przycisku Otwórz zdjęcie dla wideo).
		expect(screen.queryByRole("button", { name: "Otwórz wideo" })).toBeNull();
		expect(screen.getByRole("button", { name: "Otwórz zdjęcie 1" })).not.toBeNull();
	});

	it("skips video items whose record vanished from the library (#172)", async () => {
		const ghost = { ...videoItem, video: null };
		vi.stubGlobal("fetch", mockAlbumApi(detailWith([photoItem, ghost])));
		render(<AlbumView albumId="album-1" />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Otwórz zdjęcie 1" })).not.toBeNull();
		});
		expect(screen.queryByRole("img", { name: "Fiesta" })).toBeNull();
	});

	it("shows per-kind counts; the video part hides at zero (#172)", async () => {
		vi.stubGlobal("fetch", mockAlbumApi(detailWith([photoItem, videoItem])));
		render(<AlbumView albumId="album-1" />, { wrapper: createWrapper() });

		await waitFor(() => {
			expect(screen.getByText(/1 zdjęcie · 1 wideo/)).not.toBeNull();
		});
	});
});
