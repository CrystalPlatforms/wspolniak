// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { POST_VIEW_STAGES, PostView } from "./post-view";

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

// EmojiReactions fires reaction fetches on mount; stub them so tests don't hit the network.
beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [] }) }),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("PostView", () => {
	it("renders post with author, description, and images", () => {
		const now = new Date().toISOString();
		const post = {
			id: "post-1",
			authorId: "u1",
			description: "Wakacje nad morzem",
			createdAt: now,
			updatedAt: now,
			author: { id: "u1", name: "Tomek" },
			images: [
				{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 0, createdAt: now },
				{ id: "img-2", postId: "post-1", cfImageId: "cf-bbb", displayOrder: 1, createdAt: now },
			],
		};

		render(<PostView post={post} imageAccountHash="hash-1" />, { wrapper: createWrapper() });

		expect(screen.getByText("Tomek")).toBeDefined();
		expect(screen.getByText("Wakacje nad morzem")).toBeDefined();
		const images = screen.getAllByRole("img");
		expect(images).toHaveLength(2);
		// lazy: off-screen nie pobiera się do czasu zbliżenia do viewportu (#146)
		expect(images[0]?.getAttribute("loading")).toBe("lazy");
	});

	it("zdjęcia mają szary placeholder na zarezerwowanym slocie (min-h) i wygasają po load (#146)", () => {
		const now = new Date().toISOString();
		const post = {
			id: "post-1",
			authorId: "u1",
			description: null,
			createdAt: now,
			updatedAt: now,
			author: { id: "u1", name: "Kasia" },
			images: [
				{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 0, createdAt: now },
			],
		};

		render(<PostView post={post} imageAccountHash="hash-1" />, { wrapper: createWrapper() });

		const img = screen.getByRole("img", { name: "Zdjęcie 1" });
		const slot = img.closest("button");
		expect(slot?.className).toContain("min-h-");

		const overlay = slot?.querySelector(".fade-image-placeholder");
		expect(overlay).toBeDefined();
		expect(overlay?.getAttribute("data-revealed")).toBe("false");

		fireEvent.load(img);
		expect(overlay?.getAttribute("data-revealed")).toBe("true");
		expect(overlay?.className).toContain("fade-image-out");
	});

	it("renders post without description", () => {
		const now = new Date().toISOString();
		const post = {
			id: "post-1",
			authorId: "u1",
			description: null,
			createdAt: now,
			updatedAt: now,
			author: { id: "u1", name: "Kasia" },
			images: [
				{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 0, createdAt: now },
			],
		};

		render(<PostView post={post} imageAccountHash="hash-1" />, { wrapper: createWrapper() });

		expect(screen.getByText("Kasia")).toBeDefined();
		expect(screen.getAllByRole("img")).toHaveLength(1);
	});

	it("shows pin badge for a pinned post", () => {
		const now = new Date().toISOString();
		const post = {
			id: "post-pin",
			authorId: "u2",
			description: "Ważne ogłoszenie",
			createdAt: now,
			updatedAt: now,
			author: { id: "u2", name: "Kasia" },
			images: [],
			pinned: true,
		};

		render(<PostView post={post} imageAccountHash="hash-1" />, { wrapper: createWrapper() });

		expect(screen.getByLabelText("Przypięty post")).toBeDefined();
	});

	it("renders a bookmark button in the header next to reactions", async () => {
		const now = new Date().toISOString();
		const post = {
			id: "post-1",
			authorId: "u1",
			description: "Wakacje nad morzem",
			createdAt: now,
			updatedAt: now,
			author: { id: "u1", name: "Tomek" },
			images: [],
		};

		render(<PostView post={post} imageAccountHash="hash-1" />, { wrapper: createWrapper() });

		// Przycisk zakładki w nagłówku posta (jak w feedzie) — #128.
		expect(await screen.findByRole("button", { name: /zapisz do biblioteki/i })).toBeDefined();
	});
});

describe("PostView — choreografia widoku posta (#147)", () => {
	it("etapy mają ścisłą kolejność: photos → comments → text", () => {
		expect(POST_VIEW_STAGES).toEqual(["photos", "comments", "text"]);
	});

	it("revealText=false: autor, opis i reakcje czekają na szkieletach (etap text)", () => {
		const now = new Date().toISOString();
		const post = {
			id: "post-1",
			authorId: "u1",
			description: "Wakacje nad morzem",
			createdAt: now,
			updatedAt: now,
			author: { id: "u1", name: "Tomek" },
			images: [],
		};

		render(
			<PostView post={post} imageAccountHash="hash-1" currentUserId="u1" revealText={false} />,
			{ wrapper: createWrapper() },
		);

		expect(screen.queryByText("Tomek")).toBeNull();
		expect(screen.queryByText("Wakacje nad morzem")).toBeNull();
		expect(screen.getByTestId("skeleton-header")).toBeTruthy();
		expect(screen.getByTestId("skeleton-description")).toBeTruthy();
		// pasek reakcji (ReactionBar) schowany za lustrem układu
		expect(screen.getByTestId("skeleton-meta")).toBeTruthy();
		// zdjęcia należą do etapu photos (pierwszego) — renderują się niezależnie
		expect(screen.queryByTestId("skeleton-images")).toBeNull();
	});

	it("zgłasza onFirstImageLoad po załadowaniu pierwszego zdjęcia (bramka etapu photos)", () => {
		const now = new Date().toISOString();
		const post = {
			id: "post-1",
			authorId: "u1",
			description: null,
			createdAt: now,
			updatedAt: now,
			author: { id: "u1", name: "Tomek" },
			images: [
				{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 0, createdAt: now },
				{ id: "img-2", postId: "post-1", cfImageId: "cf-bbb", displayOrder: 1, createdAt: now },
			],
		};
		const onFirstImageLoad = vi.fn();

		render(<PostView post={post} imageAccountHash="hash-1" onFirstImageLoad={onFirstImageLoad} />, {
			wrapper: createWrapper(),
		});

		const imgs = screen.getAllByRole("img");
		expect(imgs).toHaveLength(2);
		expect(onFirstImageLoad).not.toHaveBeenCalled();

		// drugie zdjęcie nie odblokowuje etapu photos
		fireEvent.load(imgs[1] as HTMLElement);
		expect(onFirstImageLoad).not.toHaveBeenCalled();

		// pierwsze tak — dokładnie raz
		fireEvent.load(imgs[0] as HTMLElement);
		expect(onFirstImageLoad).toHaveBeenCalledTimes(1);
	});
});
