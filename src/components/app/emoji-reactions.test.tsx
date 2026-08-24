// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { ReactionTarget } from "@/db/post-reactions/queries";
import { EmojiReactions } from "./emoji-reactions";

/**
 * Założenia (rewizja HITL #161): pasek reakcji = SAM picker (bez chipsów z
 * licznikami — za dużo); „kto zareagował" przeniesiony do nagłówka posta
 * (PostWhoReacted). Moja reakcja: emoji na triggerze + zielony ring w pillu
 * (active). Klik w tę samą emoji odznacza. Optimistic na triggerze + rollback.
 */

const POST_TARGET: ReactionTarget = { kind: "post", postId: "post-1" };
const COMMENT_TARGET: ReactionTarget = {
	kind: "comment",
	postId: "post-1",
	commentId: "comment-1",
};

type MyReaction = { reactionType: string } | null;

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

function stubReactionsFetch(_target: ReactionTarget, myReaction: MyReaction = null) {
	const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
		if (init?.method === "POST" || init?.method === "DELETE") {
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
		}
		if (url.includes("/my-reaction")) {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ data: myReaction }),
			});
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function triggerEmojiSrc(): string | null {
	const trigger = screen.getByRole("button", { name: /Reagowano|Dodaj reakcję/ });
	return trigger.querySelector("img")?.getAttribute("src") ?? null;
}

async function openPillAndPick(user: ReturnType<typeof userEvent.setup>, label: string) {
	await user.click(screen.getByRole("button", { name: "Dodaj reakcję" }));
	await user.click(await screen.findByRole("menuitem", { name: label }));
}

describe("EmojiReactions", () => {
	it("renders only the picker trigger — no reaction chips", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) =>
				Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							data: url.includes("/my-reaction") ? null : { heart: 3, flame: 1 },
						}),
				}),
			),
		);
		render(<EmojiReactions target={POST_TARGET} />, { wrapper: createWrapper() });

		expect(await screen.findByRole("button", { name: "Dodaj reakcję" })).toBeTruthy();
		// Chipsów nie ma — nawet gdy istnieją reakcje innych.
		expect(screen.queryByRole("button", { name: "serce" })).toBeNull();
		expect(screen.queryByRole("button", { name: "ogień" })).toBeNull();
	});

	it("shows my reaction emoji on the trigger", async () => {
		stubReactionsFetch(POST_TARGET, { reactionType: "heart" });
		render(<EmojiReactions target={POST_TARGET} />, { wrapper: createWrapper() });

		await waitFor(() => expect(triggerEmojiSrc()).toBe("/emoji/heart.png"));
	});

	it("marks my reaction with a green ring inside the pill", async () => {
		const user = userEvent.setup();
		stubReactionsFetch(POST_TARGET, { reactionType: "heart" });
		render(<EmojiReactions target={POST_TARGET} />, { wrapper: createWrapper() });

		await user.click(await screen.findByRole("button", { name: "Reagowano serce" }));
		const heart = screen.getByRole("menuitem", { name: "serce" });
		expect(heart.classList.contains("ring-green-500")).toBe(true);
	});

	it("sends a POST when an emoji is picked in the picker", async () => {
		const user = userEvent.setup();
		const fetchMock = stubReactionsFetch(POST_TARGET);
		render(<EmojiReactions target={POST_TARGET} />, { wrapper: createWrapper() });

		await openPillAndPick(user, "ogień");

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/app/posts/post-1/reactions",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ reactionType: "flame" }),
			}),
		);
	});

	it("sends a DELETE when picking my current reaction again (odznaczenie)", async () => {
		const user = userEvent.setup();
		const fetchMock = stubReactionsFetch(POST_TARGET, { reactionType: "flame" });
		render(<EmojiReactions target={POST_TARGET} />, { wrapper: createWrapper() });

		await user.click(await screen.findByRole("button", { name: "Reagowano ogień" }));
		await user.click(await screen.findByRole("menuitem", { name: "ogień" }));

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/app/posts/post-1/reactions",
			expect.objectContaining({ method: "DELETE" }),
		);
	});

	it("POSTs to the comment endpoint for a comment target", async () => {
		const user = userEvent.setup();
		const fetchMock = stubReactionsFetch(COMMENT_TARGET);
		render(<EmojiReactions target={COMMENT_TARGET} />, { wrapper: createWrapper() });

		await openPillAndPick(user, "smutek");

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/app/posts/post-1/comments/comment-1/reactions",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("optimistically shows the picked reaction on the trigger before the server responds", async () => {
		const user = userEvent.setup();
		let resolvePost: () => void = () => {};
		const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				return new Promise((resolve) => {
					resolvePost = () => resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
				});
			}
			if (url.includes("/my-reaction")) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<EmojiReactions target={POST_TARGET} />, { wrapper: createWrapper() });
		await openPillAndPick(user, "ogień");

		// POST wisi, a trigger już pokazuje moją reakcję (optymistycznie).
		await waitFor(() => expect(triggerEmojiSrc()).toBe("/emoji/flame.png"));
		resolvePost();
	});

	it("rolls back my reaction on the trigger when the mutation fails", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
			}
			if (url.includes("/my-reaction")) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<EmojiReactions target={POST_TARGET} />, { wrapper: createWrapper() });
		await openPillAndPick(user, "ogień");

		// Po błędzie wraca smile (brak mojej reakcji).
		await waitFor(() => expect(screen.getByRole("button", { name: "Dodaj reakcję" })).toBeTruthy());
	});
});
