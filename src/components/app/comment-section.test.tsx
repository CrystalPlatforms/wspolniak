// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Założenia zakodowane w testach (stan na RED):
 * - Choreografię prowadzi strona posta (#147) — CommentSection dostaje `reveal`
 *   (czy etap `comments` odsłonięty). Default `true` = używanie poza choreografią.
 * - `reveal=false` → szkielety linii zamiast listy i formularza (dane dalej
 *   lecą w tle — fetch nie jest blokowany, tylko prezentacja czeka).
 * - `commentsQueryOptions` współdzieli klucz między sekcją a stroną (dedup
 *   TanStack Query) — test blokuje jego kształt.
 * - CommentItem zamockowany — testujemy sekcję, nie wnętrza elementu.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { CommentWithAuthor } from "./comment-section";
import { CommentSection, commentsQueryOptions } from "./comment-section";

vi.mock("@/components/app/comment-item", () => ({
	CommentItem: ({ comment }: { comment: CommentWithAuthor }) => (
		<div data-testid="comment-item">{comment.body}</div>
	),
}));

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

function makeComment(id: string, body: string): CommentWithAuthor {
	return {
		id,
		postId: "p1",
		authorId: "u2",
		body,
		parentId: null,
		createdAt: "2026-08-21T12:00:00.000Z",
		updatedAt: "2026-08-21T12:00:00.000Z",
		author: { id: "u2", name: "Kasia" },
		replies: [],
	};
}

const comments = [makeComment("c1", "Pierwszy komentarz"), makeComment("c2", "Drugi komentarz")];

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ data: comments }),
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("CommentSection — choreografia widoku posta (#147)", () => {
	it("reveal=false: szkielety linii zamiast listy i formularza", () => {
		render(
			<CommentSection postId="p1" currentUserId="u1" currentUserRole="member" reveal={false} />,
			{ wrapper: createWrapper() },
		);

		expect(screen.getByTestId("skeleton-comments")).toBeTruthy();
		expect(screen.queryByText(/skomentuj/i)).toBeNull();
		expect(screen.queryAllByTestId("comment-item")).toHaveLength(0);
	});

	it("default (reveal=true): lista komentarzy z licznikiem + formularz", async () => {
		render(<CommentSection postId="p1" currentUserId="u1" currentUserRole="member" />, {
			wrapper: createWrapper(),
		});

		expect(await screen.findByText("Komentarze (2)")).toBeTruthy();
		expect(screen.getAllByTestId("comment-item")).toHaveLength(2);
		expect(screen.getByRole("button", { name: /skomentuj/i })).toBeTruthy();
	});

	it("commentsQueryOptions: stały klucz współdzielony ze stroną posta", () => {
		expect(commentsQueryOptions("p1").queryKey).toEqual(["comments", "p1"]);
	});
});
