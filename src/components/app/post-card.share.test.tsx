// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu udostępniania posta na czacie (F5 #218):
// - Własny post (lub admin): menu „..." (PostActions) ma pozycję „Wspomnij na czacie".
// - Cudzy post: osobna ikona w rogu (aria-label „Wspomnij na czacie"), dokładnie
//   tam, gdzie u własnego postu stoi „...".
// - Oba wejścia nawigują na /app/chat z parametrem draft=post:<id> (mechanizm
//   draftu — czat pokazuje podgląd, wysyłka ręczna).
// - chatEnabled=false ukrywa obie ścieżki (flaga czatu OFF).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactElement } from "react";
import { PostCard, type PostCardPost } from "./post-card";

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		params,
		className,
		children,
		...rest
	}: ComponentProps<"a"> & { to: string; params?: Record<string, string> }) => {
		const resolved = params
			? Object.entries(params).reduce((path, [k, v]) => path.replace(`$${k}`, v), to)
			: to;
		return (
			<a href={resolved} className={className} {...rest}>
				{children}
			</a>
		);
	},
	useNavigate: () => mockNavigate,
}));

vi.mock("@/core/boot-splash", () => ({
	useBootSettled: vi.fn(() => true),
}));

function makePost(overrides: Partial<PostCardPost> = {}): PostCardPost {
	return {
		id: "p1",
		authorId: "a1",
		description: "Opis posta",
		createdAt: "2026-10-15T10:00:00.000Z",
		updatedAt: "2026-10-15T10:00:00.000Z",
		author: { id: "a1", name: "Babcia" },
		images: [],
		videos: [],
		...overrides,
	};
}

function renderCard(post: PostCardPost, chatEnabled = true): ReactElement {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return (
		<QueryClientProvider client={queryClient}>
			<PostCard
				post={post}
				imageAccountHash="hash"
				currentUserId="u1"
				currentUserRole="member"
				chatEnabled={chatEnabled}
			/>
		</QueryClientProvider>
	);
}

describe("PostCard — udostępnienie na czacie (F5 #218)", () => {
	afterEach(() => {
		cleanup();
		mockNavigate.mockClear();
	});

	it("shows the corner share icon on other people's posts and navigates with a post draft", async () => {
		const user = userEvent.setup();
		render(renderCard(makePost()));

		const shareButton = screen.getByRole("button", { name: "Wspomnij na czacie" });
		await user.click(shareButton);

		expect(mockNavigate).toHaveBeenCalledTimes(1);
		expect(mockNavigate).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "/app/chat",
				search: { draft: "post:p1" },
			}),
		);
	});

	it("adds „Wspomnij na czacie” to the own post's „...” menu", async () => {
		const user = userEvent.setup();
		render(renderCard(makePost({ authorId: "u1" })));

		// Własny post: brak osobnej ikony (menu pełni tę rolę).
		expect(screen.queryByRole("button", { name: "Wspomnij na czacie" })).toBeNull();

		await user.click(screen.getByRole("button", { name: "Opcje posta" }));
		const menuItem = await screen.findByText("Wspomnij na czacie");
		await user.click(menuItem);

		expect(mockNavigate).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "/app/chat",
				search: { draft: "post:p1" },
			}),
		);
	});

	it("hides both entry points when chat is disabled (flaga czatu OFF)", async () => {
		render(renderCard(makePost(), false));
		expect(screen.queryByRole("button", { name: "Wspomnij na czacie" })).toBeNull();

		cleanup();
		const user = userEvent.setup();
		render(renderCard(makePost({ authorId: "u1" }), false));
		await user.click(screen.getByRole("button", { name: "Opcje posta" }));

		expect(screen.queryByText("Wspomnij na czacie")).toBeNull();
		expect(mockNavigate).not.toHaveBeenCalled();
	});
});
