// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { PostCardPost } from "@/components/app/post-card";
import { BookmarksList } from "./bookmarks-list";

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

const samplePost: PostCardPost = {
	id: "post-1",
	authorId: "u2",
	description: "Wakacje nad morzem",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	author: { id: "u2", name: "Tomek" },
	images: [],
	commentCount: 0,
};

/**
 * Mock fetch: GET /api/app/bookmarks zwraca listę (pełny kształt + meta), DELETE opróżnia listę.
 * Inne endpointy (reakcje) → puste dane, by zagnieżdżone komponenty renderowały się bez błędów.
 */
function mockBookmarksApi(initial: PostCardPost[] = []) {
	let current = initial;
	return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
		if (init?.method === "DELETE") {
			current = [];
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { saved: false } }) });
		}
		if (url.includes("/api/app/bookmarks")) {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ data: current, meta: { imageAccountHash: "hash-1" } }),
			});
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
	});
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("BookmarksList", () => {
	it("renders saved posts through the same PostCard as the feed", async () => {
		vi.stubGlobal("fetch", mockBookmarksApi([samplePost]));

		render(<BookmarksList currentUserId="u1" currentUserRole="member" />, {
			wrapper: createWrapper(),
		});

		// Pełny markup PostCard: autor + opis + przycisk zakładki (a nie surowy link).
		expect(await screen.findByText("Tomek")).toBeDefined();
		expect(screen.getByText("Wakacje nad morzem")).toBeDefined();
		expect(await screen.findByRole("button", { name: /usuń z biblioteki/i })).toBeDefined();
	});

	it("shows a loading indicator while the saved posts are being fetched", () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() => new Promise(() => {})),
		);

		render(<BookmarksList currentUserId="u1" currentUserRole="member" />, {
			wrapper: createWrapper(),
		});

		expect(screen.getByRole("status")).toBeDefined();
	});

	it("shows a friendly empty-state message with a bookmark icon when there are no saved posts", async () => {
		vi.stubGlobal("fetch", mockBookmarksApi([]));

		render(<BookmarksList currentUserId="u1" currentUserRole="member" />, {
			wrapper: createWrapper(),
		});

		// Pusty stan z podpowiedzią, jak zapisać post (#130).
		expect(await screen.findByText(/nie masz jeszcze zapisanych postów/i)).toBeDefined();
		// Opcjonalna ikona zakładki jako ilustracja (#130).
		expect(document.querySelector("svg")).not.toBeNull();
	});

	it("removes a post from the list when its bookmark is toggled off", async () => {
		vi.stubGlobal("fetch", mockBookmarksApi([samplePost]));

		render(<BookmarksList currentUserId="u1" currentUserRole="member" />, {
			wrapper: createWrapper(),
		});

		// Najpierw post jest widoczny na liście.
		expect(await screen.findByText("Wakacje nad morzem")).toBeDefined();

		// Odepnij zakładkę — PostCard znika z listy po przełączeniu (#127).
		const unsaveButton = await screen.findByRole("button", { name: /usuń z biblioteki/i });
		await userEvent.click(unsaveButton);

		expect(await screen.findByText(/nie masz jeszcze zapisanych postów/i)).toBeDefined();
		expect(screen.queryByText("Wakacje nad morzem")).toBeNull();
	});
});
