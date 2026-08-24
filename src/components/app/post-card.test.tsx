// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Założenia zakodowane w testach (stan na RED):
 * - PostCard sam zarządza sekwencją (useBootSequence); interfejs publiczny bez zmian.
 * - Etapy: text (nagłówek+opis) → reactions (reakcje+l. komentarzy) → photos (media).
 * - Zdjęcia pobierają się RÓWNOLEGLE od montażu (img z src zawsze w DOM); szary
 *   overlay .skeleton wygasa fade'em dopiero, gdy zdjęcie jest załadowane ORAZ
 *   etap reactions widoczny (kolejność photos-po-reactions wymuszona per zdjęcie).
 * - Warm (settled=true od montażu): wygląd jak przed #145 — pełna treść od razu.
 * - Wideo odsłania się z etapem photos (bez własnego szkieletu — P5 dorobi).
 * - `useBootSettled` mockujemy jako granicę czasu; jego timery mają testy w boot-splash.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactElement } from "react";
import { useBootSettled } from "@/core/boot-splash";
import { PostCard, type PostCardPost } from "./post-card";

vi.mock("@/core/boot-splash", () => ({
	useBootSettled: vi.fn(),
}));

// PostCard renderuje Link (TanStack Router) — nawigacja kliencka do posta bez
// przeładowania dokumentu (#164). W testach karty wystarczy passthrough na <a>
// z rozwiązanymi params/hash; samo kliknięcie nawigacyjne testuje osobny plik
// post-card.navigation.test.tsx (prawdziwy router).
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		params,
		hash,
		className,
		children,
		...rest
	}: ComponentProps<"a"> & { to: string; params?: Record<string, string>; hash?: string }) => {
		const resolved = params
			? Object.entries(params).reduce((path, [k, v]) => path.replace(`$${k}`, v), to)
			: to;
		return (
			<a href={hash ? `${resolved}#${hash}` : resolved} className={className} {...rest}>
				{children}
			</a>
		);
	},
}));

// VideoThumb wymaga kontekstu routera (Link) — testujemy bramkowanie etapem
// photos w PostCard, nie wewnętrzności miniatury (te mają własne testy).
vi.mock("@/components/video/video-thumb", () => ({
	VideoThumb: ({ title }: { title: string }) => <div data-testid="video-thumb">{title}</div>,
}));

const mockedSettled = vi.mocked(useBootSettled);

const NOW = "2026-08-21T12:00:00.000Z";

function makePost(overrides: Partial<PostCardPost> = {}): PostCardPost {
	return {
		id: "p1",
		authorId: "a1",
		description: "Opis posta",
		createdAt: NOW,
		updatedAt: NOW,
		author: { id: "a1", name: "Babcia" },
		images: [
			{ id: "i1", postId: "p1", cfImageId: "img-1", displayOrder: 0, createdAt: NOW },
			{ id: "i2", postId: "p1", cfImageId: "img-2", displayOrder: 1, createdAt: NOW },
		],
		videos: [],
		commentCount: 3,
		...overrides,
	};
}

function wrapCard(queryClient: QueryClient, post: PostCardPost): ReactElement {
	return (
		<QueryClientProvider client={queryClient}>
			<PostCard post={post} imageAccountHash="hash" currentUserId="u1" currentUserRole="member" />
		</QueryClientProvider>
	);
}

function renderCard(post: PostCardPost) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const utils = render(wrapCard(queryClient, post));
	return {
		...utils,
		rerenderCard: (next: PostCardPost) => utils.rerender(wrapCard(queryClient, next)),
	};
}

function skeletonCount(): number {
	// Od #146 wygaszony placeholder ZOSTAJE w DOM (fade w CSS) — liczymy tylko zakryte
	return document.querySelectorAll('article .skeleton:not([data-revealed="true"])').length;
}

describe("PostCard — choreografia odsłaniania (#145)", () => {
	beforeEach(() => {
		mockedSettled.mockReset();
	});

	it("warm (boot osiadł przed montażem): etapy treści natychmiast, zero szkieletów etapów", () => {
		mockedSettled.mockReturnValue(true);
		const { container } = renderCard(makePost());

		expect(screen.getByText("Babcia")).toBeTruthy();
		expect(screen.getByText("Opis posta")).toBeTruthy();
		expect(screen.getByText("3")).toBeTruthy();
		expect(screen.queryByTestId("skeleton-header")).toBeNull();
		expect(screen.queryByTestId("skeleton-meta")).toBeNull();
		// nakładki zdjęć znikają z ich onLoad (jsdom nie ładuje obrazków sam z siebie)
		const imgs = container.querySelectorAll("article img");
		fireEvent.load(imgs[0] as HTMLElement);
		fireEvent.load(imgs[1] as HTMLElement);
		expect(skeletonCount()).toBe(0);
	});

	it("zimny start (paski jeszcze wjeżdżają): szkielety zamiast treści", () => {
		mockedSettled.mockReturnValue(false);
		const { container } = renderCard(makePost());

		expect(screen.queryByText("Babcia")).toBeNull();
		expect(screen.queryByText("Opis posta")).toBeNull();
		expect(screen.getByTestId("skeleton-header")).toBeTruthy();
		expect(screen.getByTestId("skeleton-description")).toBeTruthy();
		expect(screen.getByTestId("skeleton-meta")).toBeTruthy();
		// sloty zdjęć: szare nakładki, ale <img> już pobiera (równoległy fetch)
		expect(skeletonCount()).toBeGreaterThanOrEqual(2);
		expect(container.querySelectorAll("article img").length).toBe(2);
	});

	it("osiadnięcie pasków odsłania text+reactions w tym samym renderze; zdjęcia czekają na load", () => {
		mockedSettled.mockReturnValue(false);
		const { rerenderCard } = renderCard(makePost());

		mockedSettled.mockReturnValue(true);
		rerenderCard(makePost());

		expect(screen.getByText("Babcia")).toBeTruthy();
		expect(screen.getByText("Opis posta")).toBeTruthy();
		expect(screen.getByText("3")).toBeTruthy();
		expect(screen.queryByTestId("skeleton-meta")).toBeNull();
		// photos: nakładki nadal obecne — zdjęcia się jeszcze nie załadowały
		expect(skeletonCount()).toBe(2);
	});

	it("nakładka zdjęcia wygasa po jego onLoad — niezależnie per zdjęcie (#146: fade, zostaje w DOM)", () => {
		mockedSettled.mockReturnValue(true);
		const { container } = renderCard(makePost());

		const imgs = container.querySelectorAll("article img");
		expect(imgs.length).toBe(2);
		expect(skeletonCount()).toBe(2);

		fireEvent.load(imgs[0] as HTMLElement);
		expect(skeletonCount()).toBe(1);

		fireEvent.load(imgs[1] as HTMLElement);
		expect(skeletonCount()).toBe(0);

		// placeholdery NIE są odmontowywane — przechodzą w stan wygaszenia (fade w CSS)
		const overlays = container.querySelectorAll("article .fade-image-placeholder");
		expect(overlays.length).toBe(2);
		expect(overlays[0]?.getAttribute("data-revealed")).toBe("true");
		expect(overlays[1]?.getAttribute("data-revealed")).toBe("true");
	});

	it("kolejność wymuszona: zdjęcie załadowane przed osiadnięciem pasków zostaje zakryte", () => {
		mockedSettled.mockReturnValue(false);
		const { container, rerenderCard } = renderCard(makePost());
		const coldCount = skeletonCount(); // wszystkie kawałki szkieletu (nagłówek+opis+meta+sloty)

		fireEvent.load(container.querySelectorAll("article img")[0] as HTMLElement);
		expect(skeletonCount()).toBe(coldCount); // wciąż zakryte — choreografia ma pierwszeństwo

		mockedSettled.mockReturnValue(true);
		rerenderCard(makePost());
		expect(skeletonCount()).toBe(1); // załadowane odsłonięte, drugie czeka
	});

	it("post bez zdjęć: media gotowe od razu — cała karta odsłonięta po osiadnięciu", () => {
		mockedSettled.mockReturnValue(true);
		renderCard(makePost({ images: [], videos: [] }));

		expect(screen.getByText("Babcia")).toBeTruthy();
		expect(skeletonCount()).toBe(0);
	});

	it("wideo odsłania się z etapem photos (po zdjęciach)", () => {
		mockedSettled.mockReturnValue(false);
		const post = makePost({
			images: [],
			videos: [{ id: "v1", title: "Wakacje", thumbnailUrl: "https://yt/img", position: 0 }],
		});
		const { rerenderCard } = renderCard(post);
		expect(screen.queryByText("Wakacje")).toBeNull();

		mockedSettled.mockReturnValue(true);
		rerenderCard(post);
		expect(screen.getByText("Wakacje")).toBeTruthy();
	});
});
