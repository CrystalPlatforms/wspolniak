// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Założenia zakodowane w testach (stan na RED, #164):
 * - „Otwórz pełny post" i licznik komentarzy w karcie feedu prowadzą do widoku
 *   posta nawigacją KLIENTSKĄ (TanStack Link): klik zmienia location routera
 *   w tym samym dokumencie. Surowy <a> przeładowuje dokument → singleton splasha
 *   startuje od zera → cała sekwencja bootu odtwarza się przy każdym wejściu
 *   w post i powrocie do feedu (dokładnie bug #164).
 * - Test na PRAWDZIWYM routerze (RouterProvider + memory history) — klik po
 *   surowym <a> nie ruszyłby location routera, więc regresja wywala test.
 * - Licznik komentarzy dokleja #comments do URL (parzystość z dawnym hrefem).
 * - „Wróć do feedu" żyje w pliku route (poza discovery testów) — kryty go
 *   type-check Linka (to="/app").
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostCard, type PostCardPost } from "./post-card";

// Choreografia bootu = granica czasu; w tym teście zawsze warm (settled),
// żeby asercje dotyczyły wyłącznie nawigacji.
vi.mock("@/core/boot-splash", () => ({
	useBootSettled: () => true,
}));

// Miniatura wideo ma własne testy; tutaj wycięta, by nie ciągnąć jej zależności.
vi.mock("@/components/video/video-thumb", () => ({
	VideoThumb: ({ title }: { title: string }) => <div data-testid="video-thumb">{title}</div>,
}));

const NOW = "2026-08-21T12:00:00.000Z";

function makePost(): PostCardPost {
	return {
		id: "p1",
		authorId: "a1",
		description: "Opis posta",
		createdAt: NOW,
		updatedAt: NOW,
		author: { id: "a1", name: "Babcia" },
		images: [],
		videos: [],
		commentCount: 3,
	};
}

function renderCardInRouter() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const feed = createRootRoute({
		component: () => (
			<QueryClientProvider client={queryClient}>
				<PostCard
					post={makePost()}
					imageAccountHash="hash"
					currentUserId="u1"
					currentUserRole="member"
				/>
			</QueryClientProvider>
		),
	});
	const feedRoute = createRoute({
		getParentRoute: () => feed,
		path: "/app",
		component: () => null,
	});
	const postRoute = createRoute({
		getParentRoute: () => feed,
		path: "/app/post/$id",
		component: () => null,
	});
	const router = createRouter({
		routeTree: feed.addChildren([feedRoute, postRoute]),
		history: createMemoryHistory({ initialEntries: ["/app"] }),
	});
	// Router testowy nie jest routerem zarejestrowanym przez aplikację (Register)
	// — cast na granicy frameworka, zachowanie sprawdzamy przez router.state.
	render(<RouterProvider router={router as never} />);
	return router;
}

describe("PostCard → post: nawigacja kliencka (#164)", () => {
	it("klik w „Otwórz pełny post” zmienia location routera bez przeładowania dokumentu", async () => {
		const user = userEvent.setup();
		const router = renderCardInRouter();

		await user.click(await screen.findByRole("link", { name: /otwórz pełny post/i }));

		await waitFor(() => expect(router.state.location.pathname).toBe("/app/post/p1"));
	});

	it("klik w licznik komentarzy prowadzi do posta z #comments w URL", async () => {
		const user = userEvent.setup();
		const router = renderCardInRouter();

		await user.click(await screen.findByRole("link", { name: "3" }));

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/app/post/p1");
			expect(router.state.location.hash).toBe("comments");
		});
	});
});
