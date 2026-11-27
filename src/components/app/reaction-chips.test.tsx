// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { ReactionTarget } from "@/db/post-reactions/queries";
import { ReactionChips, rankReactions } from "./reaction-chips";

/**
 * Chipsy reakcji na karcie feedu: top 3 (desktop) / top 2 (mobile — trzeci
 * chip chowany CSS-em `hidden sm:inline-flex`), sortowanie wg liczby malejąco
 * (remisy w kolejności konfigu), klik = dialog „Kto zareagował".
 * Zero reakcji = komponent nie renderuje nic.
 */

const POST_TARGET: ReactionTarget = { kind: "post", postId: "post-1" };

type ReactionUserDTO = {
	id: string;
	reactionType: string;
	user: { id: string; name: string } | null;
};

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

function stubFetch(counts: Record<string, number>, users: ReactionUserDTO[] = []) {
	const fetchMock = vi.fn().mockImplementation((url: string) => {
		if (url.includes("/reactions/users")) {
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: users }) });
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: counts }) });
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("rankReactions", () => {
	it("sortuje wg liczby malejąco, remisy w kolejności konfigu", () => {
		const ranked = rankReactions({ heart: 3, flame: 5, wow: 3, sad: 1, laugh: 0 });
		expect(ranked.map((entry) => entry.type)).toEqual(["flame", "heart", "wow", "sad"]);
		expect(ranked[0]?.count).toBe(5);
	});

	it("pomija typy z zerem i radzi sobie z pustym rekordem", () => {
		expect(rankReactions({ laugh: 0, sad: 0 })).toEqual([]);
		expect(rankReactions({})).toEqual([]);
	});
});

describe("ReactionChips", () => {
	it("renderuje chipsy posortowane wg liczby", async () => {
		stubFetch({ heart: 3, flame: 5 });
		render(<ReactionChips target={POST_TARGET} />, { wrapper: createWrapper() });

		expect(await screen.findByRole("button", { name: "Kto zareagował: ogień (5)" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Kto zareagował: serce (3)" })).toBeTruthy();
	});

	it("trzeci chip jest chowany na mobile (hidden sm:inline-flex)", async () => {
		stubFetch({ heart: 3, flame: 5, wow: 1 });
		render(<ReactionChips target={POST_TARGET} />, { wrapper: createWrapper() });

		const third = await screen.findByRole("button", { name: "Kto zareagował: zdziwienie (1)" });
		expect(third.classList.contains("hidden")).toBe(true);
		expect(third.classList.contains("sm:inline-flex")).toBe(true);
	});

	it("nie renderuje nic przy braku reakcji", async () => {
		const fetchMock = stubFetch({});
		const { container } = render(<ReactionChips target={POST_TARGET} />, {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(container.querySelector('[data-slot="reaction-chips"]')).toBeNull();
	});

	it("klik na chips otwiera dialog z imionami", async () => {
		const user = userEvent.setup();
		stubFetch({ flame: 1 }, [
			{ id: "r1", reactionType: "flame", user: { id: "u1", name: "Kasia" } },
		]);
		render(<ReactionChips target={POST_TARGET} />, { wrapper: createWrapper() });

		await user.click(await screen.findByRole("button", { name: "Kto zareagował: ogień (1)" }));

		expect(await screen.findByText("Kasia")).toBeTruthy();
		expect(screen.getByText("Kto zareagował")).toBeTruthy();
	});
});
