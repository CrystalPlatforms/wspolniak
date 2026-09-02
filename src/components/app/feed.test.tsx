// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { Feed } from "./feed";

// Testy feedu opisują stan warm (choreografia bootu zakończona, #145);
// zimny start (szkielety etapów) mają własne testy w post-card.test.tsx.
vi.mock("@/core/boot-splash", () => ({
	useBootSettled: () => true,
}));

// PostCard renderuje Link (TanStack Router) — nawigacja kliencka do posta bez
// przeładowania dokumentu (#164); w testach feedu wystarczy passthrough na <a>
// + stub useNavigate (PostActions) — reszta modułu bez zmian.
vi.mock("@tanstack/react-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-router")>();
	return {
		...actual,
		useNavigate: () => () => {},
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
	};
});

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

const defaultProps = {
	imageAccountHash: "hash-1",
	currentUserId: "u1",
	currentUserRole: "member",
};

describe("Feed", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("renders posts with author name and description", () => {
		const now = new Date().toISOString();
		const posts = [
			{
				id: "post-1",
				authorId: "u1",
				description: "Wakacje nad morzem",
				createdAt: now,
				updatedAt: now,
				author: { id: "u1", name: "Tomek" },
				images: [
					{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 0, createdAt: now },
				],
			},
			{
				id: "post-2",
				authorId: "u2",
				description: "Urodziny babci",
				createdAt: now,
				updatedAt: now,
				author: { id: "u2", name: "Kasia" },
				images: [
					{ id: "img-2", postId: "post-2", cfImageId: "cf-bbb", displayOrder: 0, createdAt: now },
				],
			},
		];

		render(<Feed posts={posts} {...defaultProps} />, { wrapper: createWrapper() });

		expect(screen.getByText("Tomek")).toBeDefined();
		expect(screen.getByText("Wakacje nad morzem")).toBeDefined();
		expect(screen.getByText("Kasia")).toBeDefined();
		expect(screen.getByText("Urodziny babci")).toBeDefined();
	});

	it("renders empty state when no posts", () => {
		render(<Feed posts={[]} {...defaultProps} />, { wrapper: createWrapper() });

		expect(screen.getByText(/brak postów/i)).toBeDefined();
	});

	it("renders skeleton cards while the first page is pending (#145)", () => {
		const { container } = render(<Feed posts={[]} {...defaultProps} isPending />, {
			wrapper: createWrapper(),
		});

		const skeletons = container.querySelectorAll("article[aria-hidden='true']");
		expect(skeletons.length).toBe(10); // tyle, ile strona feedu — zero shiftu po danych
		expect(screen.queryByText(/brak postów/i)).toBeNull();
	});

	it("renders image thumbnails", () => {
		const now = new Date().toISOString();
		const posts = [
			{
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
			},
		];

		render(<Feed posts={posts} {...defaultProps} />, { wrapper: createWrapper() });

		const images = screen.getAllByRole("img");
		expect(images).toHaveLength(2);
		expect(images[0]?.getAttribute("src")).toContain("cf-aaa");
		expect(images[1]?.getAttribute("src")).toContain("cf-bbb");
	});

	it("shows 'koniec' message when hasNextPage is false and posts exist", () => {
		const now = new Date().toISOString();
		const posts = [
			{
				id: "post-1",
				authorId: "u1",
				description: "Test",
				createdAt: now,
				updatedAt: now,
				author: { id: "u1", name: "Tomek" },
				images: [
					{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 0, createdAt: now },
				],
			},
		];

		render(<Feed posts={posts} {...defaultProps} hasNextPage={false} />, {
			wrapper: createWrapper(),
		});

		expect(screen.getByText(/koniec/i)).toBeDefined();
	});

	it("does not show 'koniec' when there are more pages", () => {
		const now = new Date().toISOString();
		const posts = [
			{
				id: "post-1",
				authorId: "u1",
				description: "Test",
				createdAt: now,
				updatedAt: now,
				author: { id: "u1", name: "Tomek" },
				images: [
					{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 0, createdAt: now },
				],
			},
		];

		render(<Feed posts={posts} {...defaultProps} hasNextPage={true} />, {
			wrapper: createWrapper(),
		});

		expect(screen.queryByText(/koniec/i)).toBeNull();
	});

	it("renders at most 2 images per post", () => {
		const now = new Date().toISOString();
		const posts = [
			{
				id: "post-1",
				authorId: "u1",
				description: null,
				createdAt: now,
				updatedAt: now,
				author: { id: "u1", name: "Tomek" },
				images: Array.from({ length: 5 }, (_, i) => ({
					id: `img-${i}`,
					postId: "post-1",
					cfImageId: `cf-${i}`,
					displayOrder: i,
					createdAt: now,
				})),
			},
		];

		render(<Feed posts={posts} {...defaultProps} />, { wrapper: createWrapper() });

		const images = screen.getAllByRole("img");
		expect(images).toHaveLength(2);
	});

	it("shows '+N więcej' overlay when post has more than 2 images", () => {
		const now = new Date().toISOString();
		const posts = [
			{
				id: "post-1",
				authorId: "u1",
				description: null,
				createdAt: now,
				updatedAt: now,
				author: { id: "u1", name: "Tomek" },
				images: Array.from({ length: 5 }, (_, i) => ({
					id: `img-${i}`,
					postId: "post-1",
					cfImageId: `cf-${i}`,
					displayOrder: i,
					createdAt: now,
				})),
			},
		];

		render(<Feed posts={posts} {...defaultProps} />, { wrapper: createWrapper() });

		// #145: plakietka pojawia się razem ze zdjęciem (nakładka szkieletu znika po onLoad)
		const imgs = screen.getAllByRole("img");
		for (const img of imgs) fireEvent.load(img);
		expect(screen.getByText("+3 więcej")).toBeDefined();
	});

	it("shows loading indicator when fetching next page", async () => {
		const now = new Date().toISOString();
		const posts = [
			{
				id: "post-1",
				authorId: "u1",
				description: "Test",
				createdAt: now,
				updatedAt: now,
				author: { id: "u1", name: "Tomek" },
				images: [
					{ id: "img-1", postId: "post-1", cfImageId: "cf-aaa", displayOrder: 0, createdAt: now },
				],
			},
		];

		render(<Feed posts={posts} {...defaultProps} hasNextPage={true} isFetchingNextPage={true} />, {
			wrapper: createWrapper(),
		});

		await act(() => vi.advanceTimersByTimeAsync(1500));
		expect(document.querySelector("output.loader")).not.toBeNull();
	});

	it("shows reaction picker trigger on someone else's post for member", () => {
		const now = new Date().toISOString();
		const posts = [
			{
				id: "post-2",
				authorId: "u2",
				description: "Cudzy post",
				createdAt: now,
				updatedAt: now,
				author: { id: "u2", name: "Kasia" },
				images: [],
			},
		];

		render(<Feed posts={posts} {...defaultProps} />, { wrapper: createWrapper() });

		expect(screen.getByRole("button", { name: "Dodaj reakcję" })).toBeDefined();
	});

	it("shows pin badge for pinned posts", () => {
		const now = new Date().toISOString();
		const posts = [
			{
				id: "post-pin",
				authorId: "u2",
				description: "Ważne ogłoszenie",
				createdAt: now,
				updatedAt: now,
				author: { id: "u2", name: "Kasia" },
				images: [],
				pinned: true,
			},
		];

		render(<Feed posts={posts} {...defaultProps} />, { wrapper: createWrapper() });

		expect(screen.getByLabelText("Przypięty post")).toBeDefined();
	});

	it("does not show pin badge for regular posts", () => {
		const now = new Date().toISOString();
		const posts = [
			{
				id: "post-1",
				authorId: "u2",
				description: "zwykły post",
				createdAt: now,
				updatedAt: now,
				author: { id: "u2", name: "Kasia" },
				images: [],
			},
		];

		render(<Feed posts={posts} {...defaultProps} />, { wrapper: createWrapper() });

		expect(screen.queryByLabelText("Przypięty post")).toBeNull();
	});

	it("renders a @mention in the description as green", () => {
		const now = new Date().toISOString();
		const posts = [
			{
				id: "post-1",
				authorId: "u2",
				description: "Hej @Ania co tam",
				createdAt: now,
				updatedAt: now,
				author: { id: "u2", name: "Kasia" },
				images: [],
			},
		];

		render(<Feed posts={posts} {...defaultProps} />, { wrapper: createWrapper() });

		const mention = screen.getByText("@Ania");
		expect(mention.className).toContain("text-primary");
	});

	it("aktywne wyszukiwanie bez trafień pokazuje „Nic nie znaleziono” zamiast „Brak postów”", () => {
		render(<Feed posts={[]} {...defaultProps} query="xyzabc" />, { wrapper: createWrapper() });

		expect(screen.getByText("Nic nie znaleziono")).toBeDefined();
		expect(screen.getByText(/wyczyść wyszukiwanie/i)).toBeDefined();
		expect(screen.queryByText(/brak postów/i)).toBeNull();
	});

	it("aktywne wyszukiwanie chowa footer paginacji („Załaduj więcej”/„Koniec”)", () => {
		const now = new Date().toISOString();
		const posts = [
			{
				id: "post-1",
				authorId: "u1",
				description: "Wakacje nad morzem",
				createdAt: now,
				updatedAt: now,
				author: { id: "u1", name: "Tomek" },
				images: [],
			},
		];

		render(<Feed posts={posts} {...defaultProps} query="morzem" hasNextPage={false} />, {
			wrapper: createWrapper(),
		});

		expect(screen.getByText("Tomek")).toBeDefined();
		expect(screen.queryByText(/koniec/i)).toBeNull();
		expect(screen.queryByText(/załaduj więcej/i)).toBeNull();
	});
});
