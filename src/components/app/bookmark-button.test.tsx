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
	it("shows 'Zapisz do Biblioteki', unfilled icon and aria-pressed=false when the post is not saved", async () => {
		vi.stubGlobal("fetch", mockBookmarksFetch([]));

		render(<BookmarkButton postId="post-1" />, { wrapper: createWrapper() });

		const button = await screen.findByRole("button", { name: /zapisz do biblioteki/i });
		expect(button.getAttribute("aria-pressed")).toBe("false");
		expect(button.querySelector("svg")?.getAttribute("fill")).not.toBe("currentColor");
	});

	it("shows 'Usuń z Biblioteki', filled icon and aria-pressed=true when the post is saved", async () => {
		vi.stubGlobal("fetch", mockBookmarksFetch(["post-1"]));

		render(<BookmarkButton postId="post-1" />, { wrapper: createWrapper() });

		const button = await screen.findByRole("button", { name: /usuń z biblioteki/i });
		expect(button.getAttribute("aria-pressed")).toBe("true");
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
});
