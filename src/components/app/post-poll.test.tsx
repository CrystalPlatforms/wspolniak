// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu PostPoll (#241, spisane przed testami):
// - wyniki widać ZAWSZE (paski + % + liczniki), także przed oddaniem głosu;
// - mój głos: podświetlony (aria-pressed=true) + checkmark;
// - klik w opcję = POST /api/app/posts/:id/poll/vote {optionIndex};
//   klik w WŁASNĄ opcję nic nie wysyła (brak wycofywania w postach);
// - optymistyczny update: licznik i podświetlenie przeskakują NATYCHMIAST po
//   kliku (zanim odpowie fetch), a po odpowiedzi serwera liczniki się zgadzają;
// - głosowanie tajne: w UI nigdy nie ma nazwisk ani id głosujących.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act, type ReactNode } from "react";
import { PostPoll } from "./post-poll";

const POLL = {
	question: "Gdzie jedziemy?",
	options: ["Morze", "Góry"],
	counts: [1, 2],
	myVoteIndex: null,
};

function wrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

function mockFetchOk(counts: number[], myVoteIndex: number) {
	return vi.fn(async () => ({
		ok: true,
		json: async () => ({ data: { counts, myVoteIndex } }),
	}));
}

describe("PostPoll", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("pokazuje opcje z paskami wyniku i licznikami PRZED głosowaniem", () => {
		render(<PostPoll postId="post-1" poll={POLL} />, { wrapper: wrapper() });

		const morze = screen.getByRole("button", { name: /głosuj na: morze/i });
		expect(morze.getAttribute("aria-pressed")).toBe("false");
		expect(screen.getByText("Gdzie jedziemy?")).toBeDefined();
		// Wyniki od razu: 1 z 3 = 33%, 2 z 3 = 67%
		expect(screen.getByText("33%")).toBeDefined();
		expect(screen.getByText("67%")).toBeDefined();
		// Podsumowanie z polską odmianą
		expect(screen.getByText("3 głosy")).toBeDefined();
	});

	it("mój głos jest podświetlony (aria-pressed)", () => {
		render(<PostPoll postId="post-1" poll={{ ...POLL, myVoteIndex: 1 }} />, { wrapper: wrapper() });

		expect(
			screen.getByRole("button", { name: /głosuj na: góry/i }).getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			screen.getByRole("button", { name: /głosuj na: morze/i }).getAttribute("aria-pressed"),
		).toBe("false");
	});

	it("klik w opcję wysyła głos na auth endpoint", async () => {
		const fetchMock = mockFetchOk([2, 2], 0);
		vi.stubGlobal("fetch", fetchMock);

		render(<PostPoll postId="post-1" poll={POLL} />, { wrapper: wrapper() });
		fireEvent.click(screen.getByRole("button", { name: /głosuj na: morze/i }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/app/posts/post-1/poll/vote",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ optionIndex: 0 }),
				}),
			);
		});
	});

	it("optymistycznie: licznik i podświetlenie przeskakują zanim odpowie serwer", async () => {
		let resolveFetch: (value: unknown) => void = () => {};
		vi.stubGlobal(
			"fetch",
			vi.fn(
				() =>
					new Promise((resolve) => {
						resolveFetch = resolve;
					}),
			),
		);

		// PostPoll renderuje się z propsów rodzica, a rodzic w produkcji czyta
		// post z cache react-query (feed/widok posta). Harness odtwarza ten wiring:
		// patch cache'a w onMutate musi przerenderować rodzica z nowymi propsami.
		const { useQuery } = await import("@tanstack/react-query");
		function Parent() {
			const { data } = useQuery({
				queryKey: ["posts", "post-1"],
				queryFn: async () => ({ data: { id: "post-1", poll: POLL } }),
			});
			const post = data?.data as { id: string; poll: typeof POLL } | undefined;
			if (!post) return null;
			return <PostPoll postId="post-1" poll={post.poll} />;
		}

		render(<Parent />, { wrapper: wrapper() });
		await waitFor(() => screen.getByRole("button", { name: /głosuj na: morze/i }));
		fireEvent.click(screen.getByRole("button", { name: /głosuj na: morze/i }));

		// Zanim fetch się rozwiąże: morze 2/4 = 50%, mój głos podświetlony.
		// (Notyfikacje cache React Query lecą asynchronicznie — flush przez act.)
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
		// 2/2 głosów — obie opcje po 50%
		expect(screen.getAllByText("50%")).toHaveLength(2);
		expect(
			screen.getByRole("button", { name: /głosuj na: morze/i }).getAttribute("aria-pressed"),
		).toBe("true");

		// Po odpowiedzi serwera liczniki nadpisują optymistyczne (te same tu)
		resolveFetch({
			ok: true,
			json: async () => ({ data: { counts: [2, 2], myVoteIndex: 0 } }),
		});
		await waitFor(() => expect(screen.getAllByText("50%")).toHaveLength(2));
	});

	it("klik we WŁASNĄ opcję nie wysyła głosu (brak wycofywania w postach)", async () => {
		const fetchMock = mockFetchOk([2, 2], 0);
		vi.stubGlobal("fetch", fetchMock);

		render(<PostPoll postId="post-1" poll={{ ...POLL, myVoteIndex: 0 }} />, { wrapper: wrapper() });
		fireEvent.click(screen.getByRole("button", { name: /głosuj na: morze/i }));

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("klik w inną opcję = zmiana głosu (optionIndex nowej opcji)", async () => {
		const fetchMock = mockFetchOk([1, 3], 1);
		vi.stubGlobal("fetch", fetchMock);

		render(<PostPoll postId="post-1" poll={{ ...POLL, myVoteIndex: 0 }} />, { wrapper: wrapper() });
		fireEvent.click(screen.getByRole("button", { name: /głosuj na: góry/i }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/app/posts/post-1/poll/vote",
				expect.objectContaining({ body: JSON.stringify({ optionIndex: 1 }) }),
			);
		});
	});
});
