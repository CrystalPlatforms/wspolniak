// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { ReactionTarget } from "@/db/post-reactions/queries";
import { ReactionBar } from "./reaction-bar";

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

type Counts = Record<string, number>;
type MyReaction = { reactionType: string } | null;

function reactionsBase(target: ReactionTarget): string {
	return target.kind === "post"
		? `/api/app/posts/${target.postId}`
		: `/api/app/posts/${target.postId}/comments/${target.commentId}`;
}

function mockFetch(target: ReactionTarget, counts: Counts, myReaction: MyReaction = null) {
	const base = reactionsBase(target);
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string) => {
			if (url.includes("/my-reaction")) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: myReaction }) });
			}
			if (url.startsWith(base)) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: counts }) });
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
		}),
	);
}

const POST_TARGET: ReactionTarget = { kind: "post", postId: "post-1" };

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("ReactionBar (render)", () => {
	it("renders exactly 3 reaction buttons with aria-labels serce/śmiech/ogień", async () => {
		mockFetch(POST_TARGET, {});

		render(<ReactionBar target={POST_TARGET} />, { wrapper: createWrapper() });

		expect(await screen.findByRole("button", { name: /serce/ })).toBeDefined();
		expect(await screen.findByRole("button", { name: /śmiech/ })).toBeDefined();
		expect(await screen.findByRole("button", { name: /ogień/ })).toBeDefined();
	});

	it("shows the counter next to each icon", async () => {
		mockFetch(POST_TARGET, { heart: 3, laugh: 1, flame: 5 });

		render(<ReactionBar target={POST_TARGET} />, { wrapper: createWrapper() });

		const heart = await screen.findByRole("button", { name: /serce/ });
		const laugh = await screen.findByRole("button", { name: /śmiech/ });
		const flame = await screen.findByRole("button", { name: /ogień/ });

		expect(within(heart).getByText("3")).toBeDefined();
		expect(within(laugh).getByText("1")).toBeDefined();
		expect(within(flame).getByText("5")).toBeDefined();
	});

	it("colors the selected icon with its reaction color and fills it, others muted", async () => {
		mockFetch(POST_TARGET, { heart: 1 }, { reactionType: "heart" });

		render(<ReactionBar target={POST_TARGET} />, { wrapper: createWrapper() });

		const heart = await screen.findByRole("button", { name: /serce/ });
		const laugh = await screen.findByRole("button", { name: /śmiech/ });
		const heartIcon = heart.querySelector("svg");
		const laughIcon = laugh.querySelector("svg");

		expect(heart.style.color).toBe("rgb(228, 35, 36)");
		expect(heart.getAttribute("aria-pressed")).toBe("true");
		expect(heartIcon?.getAttribute("fill")).toBe("currentColor");
		expect(laugh.style.color).toBe("");
		expect(laugh.className).toContain("text-muted-foreground");
		expect(laughIcon?.getAttribute("fill")).not.toBe("currentColor");
	});
});

describe("ReactionBar (interaction)", () => {
	it("sends a POST with the reactionType when an unselected icon is clicked", async () => {
		const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
			if (opts?.method === "POST") {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: { reactionType: "laugh" } }),
				});
			}
			if (url.includes("/my-reaction")) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<ReactionBar target={POST_TARGET} />, { wrapper: createWrapper() });

		const laugh = await screen.findByRole("button", { name: /śmiech/ });
		await userEvent.click(laugh);

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/app/posts/post-1/reactions",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ reactionType: "laugh" }),
			}),
		);
	});

	it("sends a DELETE when the already-selected icon is clicked", async () => {
		let resolveDelete: () => void = () => {};
		const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
			if (opts?.method === "DELETE") {
				return new Promise((resolve) => {
					resolveDelete = () =>
						resolve({ ok: true, json: () => Promise.resolve({ data: { removed: true } }) });
				});
			}
			if (url.includes("/my-reaction")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: { reactionType: "heart" } }),
				});
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { heart: 1 } }) });
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<ReactionBar target={POST_TARGET} />, { wrapper: createWrapper() });

		const heart = await screen.findByRole("button", { name: /serce/ });
		await userEvent.click(heart);

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/app/posts/post-1/reactions",
			expect.objectContaining({ method: "DELETE" }),
		);
		// No POST happened — the click toggles off instead of re-setting the reaction.
		const postCalls = fetchMock.mock.calls.filter(
			(c) => (c[1] as RequestInit | undefined)?.method === "POST",
		);
		expect(postCalls).toHaveLength(0);

		resolveDelete();
	});

	it("optimistically decrements the counter and clears selection before the server responds", async () => {
		let resolveDelete: () => void = () => {};
		const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
			if (opts?.method === "DELETE") {
				return new Promise((resolve) => {
					resolveDelete = () =>
						resolve({ ok: true, json: () => Promise.resolve({ data: { removed: true } }) });
				});
			}
			if (url.includes("/my-reaction")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: { reactionType: "heart" } }),
				});
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { heart: 1 } }) });
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<ReactionBar target={POST_TARGET} />, { wrapper: createWrapper() });

		const heart = await screen.findByRole("button", { name: /serce/ });
		await userEvent.click(heart);

		// Before server responds: counter drops to 0 and the icon is no longer pressed.
		expect(within(heart).getByText("0")).toBeDefined();
		expect(heart.getAttribute("aria-pressed")).toBe("false");

		resolveDelete();
	});

	it("rolls back the removal when the DELETE fails", async () => {
		const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
			if (opts?.method === "DELETE") {
				return Promise.resolve({ ok: false, status: 500 });
			}
			if (url.includes("/my-reaction")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: { reactionType: "heart" } }),
				});
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { heart: 1 } }) });
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<ReactionBar target={POST_TARGET} />, { wrapper: createWrapper() });

		const heart = await screen.findByRole("button", { name: /serce/ });
		await userEvent.click(heart);

		// After error: counter restored to 1 and the icon selected again.
		expect(within(heart).getByText("1")).toBeDefined();
		expect(heart.getAttribute("aria-pressed")).toBe("true");
	});

	it("updates the counter optimistically before the server responds", async () => {
		let resolvePost: () => void = () => {};
		const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
			if (opts?.method === "POST") {
				return new Promise((resolve) => {
					resolvePost = () =>
						resolve({
							ok: true,
							json: () => Promise.resolve({ data: { reactionType: "laugh" } }),
						});
				});
			}
			if (url.includes("/my-reaction")) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { heart: 3 } }) });
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<ReactionBar target={POST_TARGET} />, { wrapper: createWrapper() });

		await screen.findByText("3");

		const laugh = screen.getByRole("button", { name: /śmiech/ });
		await userEvent.click(laugh);

		// Before server responds: laugh shows 1 (optimistic +1), heart stays 3
		expect(within(laugh).getByText("1")).toBeDefined();

		resolvePost();
	});

	it("rolls back the counter when the mutation fails", async () => {
		const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
			if (opts?.method === "POST") {
				return Promise.resolve({ ok: false, status: 500 });
			}
			if (url.includes("/my-reaction")) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { heart: 3 } }) });
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<ReactionBar target={POST_TARGET} />, { wrapper: createWrapper() });

		await screen.findByText("3");

		const laugh = screen.getByRole("button", { name: /śmiech/ });
		await userEvent.click(laugh);

		// After error: laugh reverted to 0, optimistic "1" is gone
		expect(within(laugh).queryByText("1")).toBeNull();
		expect(within(laugh).getByText("0")).toBeDefined();
	});

	it("applies the pop animation class to the icon being added", async () => {
		let resolvePost: () => void = () => {};
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
				if (opts?.method === "POST") {
					return new Promise((resolve) => {
						resolvePost = () =>
							resolve({
								ok: true,
								json: () => Promise.resolve({ data: { reactionType: "flame" } }),
							});
					});
				}
				if (url.includes("/my-reaction")) {
					return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
				}
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
			}),
		);

		render(<ReactionBar target={POST_TARGET} />, { wrapper: createWrapper() });

		const flame = await screen.findByRole("button", { name: /ogień/ });
		await userEvent.click(flame);

		expect(flame.style.animation).toContain("reaction-pop");

		resolvePost();
	});

	it("POSTs to the comment endpoint for a comment target", async () => {
		const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
			if (opts?.method === "POST") {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: { reactionType: "flame" } }),
				});
			}
			if (url.includes("/my-reaction")) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
		});
		vi.stubGlobal("fetch", fetchMock);

		const commentTarget: ReactionTarget = {
			kind: "comment",
			postId: "post-1",
			commentId: "comment-1",
		};
		render(<ReactionBar target={commentTarget} />, { wrapper: createWrapper() });

		const flame = await screen.findByRole("button", { name: /ogień/ });
		await userEvent.click(flame);

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/app/posts/post-1/comments/comment-1/reactions",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ reactionType: "flame" }),
			}),
		);
	});

	it("refreshes the who-reacted list after reacting so the user sees themselves", async () => {
		let usersCallCount = 0;
		const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
			if (opts?.method === "POST") {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: { reactionType: "heart" } }),
				});
			}
			if (url.includes("/reactions/users")) {
				usersCallCount += 1;
				const data =
					usersCallCount >= 2
						? [
								{
									id: "r1",
									postId: "post-1",
									commentId: null,
									userId: "u1",
									reactionType: "heart",
									createdAt: "2026-01-01",
									updatedAt: "2026-01-01",
									user: { name: "Tomek" },
								},
							]
						: [];
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) });
			}
			if (url.includes("/my-reaction")) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
		});
		vi.stubGlobal("fetch", fetchMock);

		const { ReactionUsers } = await import("./reaction-users");
		render(
			<>
				<ReactionBar target={POST_TARGET} />
				<ReactionUsers target={POST_TARGET} />
			</>,
			{ wrapper: createWrapper() },
		);

		// Initially: open the dialog — no reactions yet.
		const usersTrigger = await screen.findByRole("button", { name: /pokaż kto zareagował/i });
		await userEvent.click(usersTrigger);
		expect(await screen.findByText(/brak reakcji/i)).toBeDefined();
		await userEvent.keyboard("{Escape}");

		// React via the bar.
		const heart = screen.getByRole("button", { name: /serce/ });
		await userEvent.click(heart);

		// Reopen — own reaction now appears (users query was invalidated + refetched).
		await userEvent.click(usersTrigger);
		expect(await screen.findByText("Tomek")).toBeDefined();
	});
});
