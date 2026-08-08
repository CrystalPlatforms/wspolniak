// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { BookmarkButton } from "./bookmark-button";

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

/** Mock fetch dla endpointów bookmarków. savedIds = lista ID zapisanych postów (GET). */
function mockBookmarksFetch(savedIds: string[] = []) {
	return vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
		if (opts?.method === "POST") {
			return Promise.resolve({
				ok: true,
				status: 201,
				json: () => Promise.resolve({ data: { saved: true } }),
			});
		}
		if (opts?.method === "DELETE") {
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { saved: false } }) });
		}
		// GET /api/app/bookmarks → pełne posty; interesują nas tylko ID.
		return Promise.resolve({
			ok: true,
			json: () => Promise.resolve({ data: savedIds.map((id) => ({ id })) }),
		});
	});
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("BookmarkButton (render)", () => {
	it("shows 'Zapisz do Biblioteki', unfilled gray icon and aria-pressed=false when not saved", async () => {
		vi.stubGlobal("fetch", mockBookmarksFetch([]));

		render(<BookmarkButton postId="post-1" />, { wrapper: createWrapper() });

		const button = await screen.findByRole("button", { name: /zapisz do biblioteki/i });
		expect(button.getAttribute("aria-pressed")).toBe("false");
		expect(button.style.color).toBe("");
		expect(button.querySelector("svg")?.getAttribute("fill")).not.toBe("currentColor");
	});

	it("shows 'Usuń z Biblioteki', filled yellow icon and aria-pressed=true when saved", async () => {
		vi.stubGlobal("fetch", mockBookmarksFetch(["post-1"]));

		render(<BookmarkButton postId="post-1" />, { wrapper: createWrapper() });

		const button = await screen.findByRole("button", { name: /usuń z biblioteki/i });
		expect(button.getAttribute("aria-pressed")).toBe("true");
		// #fcc740 → rgb(252, 199, 64): kontur i wypełnienie ikony w żółtym kolorze.
		expect(button.style.color).toBe("rgb(252, 199, 64)");
		expect(button.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});
});

describe("BookmarkButton (interaction)", () => {
	it("sends POST /api/app/bookmarks with postId when an unsaved post is clicked", async () => {
		const fetchMock = mockBookmarksFetch([]);
		vi.stubGlobal("fetch", fetchMock);

		render(<BookmarkButton postId="post-1" />, { wrapper: createWrapper() });

		const button = await screen.findByRole("button", { name: /zapisz do biblioteki/i });
		await userEvent.click(button);

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/app/bookmarks",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ postId: "post-1" }),
			}),
		);
	});

	it("sends DELETE /api/app/bookmarks/:postId when a saved post is clicked", async () => {
		const fetchMock = mockBookmarksFetch(["post-1"]);
		vi.stubGlobal("fetch", fetchMock);

		render(<BookmarkButton postId="post-1" />, { wrapper: createWrapper() });

		const button = await screen.findByRole("button", { name: /usuń z biblioteki/i });
		await userEvent.click(button);

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/app/bookmarks/post-1",
			expect.objectContaining({ method: "DELETE" }),
		);
	});

	it("reflects saved state after a successful POST refetches the list", async () => {
		let savedIds: string[] = [];
		const fetchMock = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
			if (opts?.method === "POST") {
				savedIds = ["post-1"];
				return Promise.resolve({
					ok: true,
					status: 201,
					json: () => Promise.resolve({ data: { saved: true } }),
				});
			}
			if (opts?.method === "DELETE") {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: { saved: false } }),
				});
			}
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ data: savedIds.map((id) => ({ id })) }),
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<BookmarkButton postId="post-1" />, { wrapper: createWrapper() });

		const button = await screen.findByRole("button", { name: /zapisz do biblioteki/i });
		await userEvent.click(button);

		// Po POST + invalidate + refetch przycisk pokazuje stan zapisany.
		expect(await screen.findByRole("button", { name: /usuń z biblioteki/i })).toBeDefined();
	});

	it("plays a pop animation on the icon when the bookmark is toggled", async () => {
		vi.stubGlobal("fetch", mockBookmarksFetch([]));

		render(<BookmarkButton postId="post-1" />, { wrapper: createWrapper() });

		const button = await screen.findByRole("button", { name: /zapisz do biblioteki/i });
		await userEvent.click(button);

		// Subtelna animacja „pop" aplikowana na ikonie przy przełączeniu (#125).
		expect(button.querySelector("svg")?.style.animation).toContain("bookmark-pop");
	});
});

describe("BookmarkButton (optimistic update)", () => {
	it("flips the icon to saved immediately, before POST resolves", async () => {
		// POST nigdy się nie rozwiązuje — udowadnia, że ikona zmienia stan optymistycznie
		// (bez czekania na odpowiedź API) — #126.
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
				if (opts?.method === "POST") return new Promise(() => {});
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
			}),
		);

		render(<BookmarkButton postId="post-1" />, { wrapper: createWrapper() });

		const button = await screen.findByRole("button", { name: /zapisz do biblioteki/i });
		await userEvent.click(button);

		// Natychmiast po kliknięciu ikona pokazuje stan zapisany (żółta, wypełniona).
		const saved = await screen.findByRole("button", { name: /usuń z biblioteki/i });
		expect(saved.getAttribute("aria-pressed")).toBe("true");
		expect(saved.style.color).toBe("rgb(252, 199, 64)");
		expect(saved.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});

	it("reverts the icon to unsaved when POST fails", async () => {
		// POST odrzuca — po błędzie optymistyczny stan zapisany musi wrócić do niezapisanego (#126).
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
				if (opts?.method === "POST") return Promise.reject(new Error("network"));
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
			}),
		);

		render(<BookmarkButton postId="post-1" />, { wrapper: createWrapper() });

		const button = await screen.findByRole("button", { name: /zapisz do biblioteki/i });
		await userEvent.click(button);

		// Po błędzie API ikona wraca do stanu niezapisanego (szara, pusta).
		const reverted = await screen.findByRole("button", { name: /zapisz do biblioteki/i });
		expect(reverted.getAttribute("aria-pressed")).toBe("false");
		expect(reverted.querySelector("svg")?.getAttribute("fill")).not.toBe("currentColor");
	});

	it("flips the icon to unsaved immediately, before DELETE resolves", async () => {
		// Symetrycznie: odpinanie też działa optymistycznie — DELETE nigdy się nie rozwiązuje.
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
				if (opts?.method === "DELETE") return new Promise(() => {});
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: [{ id: "post-1" }] }),
				});
			}),
		);

		render(<BookmarkButton postId="post-1" />, { wrapper: createWrapper() });

		const button = await screen.findByRole("button", { name: /usuń z biblioteki/i });
		await userEvent.click(button);

		// Natychmiast po kliknięciu ikona pokazuje stan niezapisany (szara, pusta).
		const unsaved = await screen.findByRole("button", { name: /zapisz do biblioteki/i });
		expect(unsaved.getAttribute("aria-pressed")).toBe("false");
		expect(unsaved.style.color).toBe("");
		expect(unsaved.querySelector("svg")?.getAttribute("fill")).not.toBe("currentColor");
	});
});
