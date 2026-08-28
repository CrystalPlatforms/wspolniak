// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia F7 #176: stan „widziane" jest PER URZĄDZENIE (localStorage).
// Brak timestampu = „nic nie widziane" → kropka świeci (nagłośnienie sekcji)
// i gaśnie po markAlbumsSeen(). Kropka porównuje createdAt z GET /albums/newest.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import {
	getAlbumsSeenAtMs,
	markAlbumsSeen,
	useAlbumsNewDot,
	useAlbumsSeenAtMs,
} from "./albums-seen";

function DotProbe() {
	const seenAt = useAlbumsSeenAtMs();
	const showDot = useAlbumsNewDot();
	return (
		<div>
			<span data-testid="seen">{seenAt === null ? "null" : String(seenAt)}</span>
			<span data-testid="dot">{showDot ? "dot" : "none"}</span>
		</div>
	);
}

function renderProbe() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<DotProbe />
		</QueryClientProvider>,
	);
}

function mockNewestApi(createdAt: string | null) {
	return vi.fn().mockImplementation((url: string) => {
		if (url.includes("/api/app/albums/newest")) {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ data: { createdAt } }),
			});
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
	});
}

afterEach(() => {
	cleanup();
	window.localStorage.clear();
	vi.unstubAllGlobals();
});

describe("getAlbumsSeenAtMs / markAlbumsSeen (F7 #176)", () => {
	it("returns null when no timestamp is stored", () => {
		expect(getAlbumsSeenAtMs()).toBeNull();
	});

	it("stores and reads back a timestamp", () => {
		markAlbumsSeen();
		expect(getAlbumsSeenAtMs()).not.toBeNull();
	});
});

describe("useAlbumsNewDot (F7 #176)", () => {
	it("shows the dot when a newer album exists and no timestamp is stored", async () => {
		vi.stubGlobal("fetch", mockNewestApi("2026-08-28T10:00:00.000Z"));
		renderProbe();

		await waitFor(() => {
			expect(screen.getByTestId("dot").textContent).toBe("dot");
		});
	});

	it("hides the dot once albums were marked seen after the newest album", async () => {
		vi.stubGlobal("fetch", mockNewestApi("2026-08-28T10:00:00.000Z"));
		renderProbe();

		await waitFor(() => {
			expect(screen.getByTestId("dot").textContent).toBe("dot");
		});
		markAlbumsSeen();
		await waitFor(() => {
			expect(screen.getByTestId("dot").textContent).toBe("none");
		});
	});

	it("hides the dot when there are no albums at all", async () => {
		vi.stubGlobal("fetch", mockNewestApi(null));
		renderProbe();

		await waitFor(() => {
			expect(screen.getByTestId("dot").textContent).toBe("none");
		});
	});
});
