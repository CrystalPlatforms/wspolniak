// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { BookmarksList } from "./bookmarks-list";

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

interface SavedPost {
	id: string;
	description: string | null;
	createdAt: string;
	author: { id: string; name: string };
}

/** Mock GET /api/app/bookmarks — zwraca podane posty w kształcie listy zapisanych. */
function mockBookmarksListFetch(posts: SavedPost[] = []) {
	return vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve({ data: posts }),
	});
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("BookmarksList", () => {
	it("renders the saved posts fetched from GET /api/app/bookmarks", async () => {
		vi.stubGlobal(
			"fetch",
			mockBookmarksListFetch([
				{
					id: "post-1",
					description: "Post pierwszy",
					createdAt: "2026-01-01T00:00:00.000Z",
					author: { id: "u1", name: "Tomek" },
				},
			]),
		);

		render(<BookmarksList />, { wrapper: createWrapper() });

		expect(await screen.findByText("Post pierwszy")).toBeDefined();
		expect(screen.getByText("Tomek")).toBeDefined();
		// Każdy zapisany post linkuje do strony posta.
		expect(screen.getByRole("link", { name: /post pierwszy/i }).getAttribute("href")).toBe(
			"/app/post/post-1",
		);
	});

	it("shows a loading indicator while the saved posts are being fetched", () => {
		// Nigdy nie resolvable fetch — komponent zostaje w stanie isPending.
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() => new Promise(() => {})),
		);

		render(<BookmarksList />, { wrapper: createWrapper() });

		expect(screen.getByRole("status")).toBeDefined();
	});

	it("shows an empty message when there are no saved posts", async () => {
		vi.stubGlobal("fetch", mockBookmarksListFetch([]));

		render(<BookmarksList />, { wrapper: createWrapper() });

		expect(await screen.findByText(/brak zapisanych postów/i)).toBeDefined();
	});
});
