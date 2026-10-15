// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu ChatBubblePoll (F2 #215):
// - Renderuje pytanie (message.text), opcje i procenty z cache CHAT_POLLS_KEY.
// - Klik w opcję = POST głosu; mój głos podświetlony (aria-pressed), liczniki
//   z odpowiedzi serwera nadpisują cache (broadcast zrobi to samo — idempotentnie).
// - GŁOSOWANIE TAJNE: komponent dostaje wyłącznie agregaty — nazwisk nie ma
//   nigdzie w DOM (AC #215).
// - Uszkodzony payload → fallback na zwykły tekst bąbelka.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { ChatBubblePoll } from "./chat-bubble-poll";
import { applyPollVoteUpdate, CHAT_POLLS_KEY } from "./chat-polls";
import type { ChatMessageItem } from "./chat-view";

function pollMessage(): ChatMessageItem {
	return {
		id: "m-poll",
		authorId: "u2",
		text: "Pizza w piątek?",
		kind: "poll",
		payload: { options: ["Tak", "Nie"] },
		replyToId: null,
		replyText: null,
		createdAt: "2026-08-22T10:00:00.000Z",
		expiresAt: "2026-08-23T10:00:00.000Z",
		author: { id: "u2", name: "Kasia" },
	};
}

function createWrapper(client: QueryClient) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("ChatBubblePoll (F2 #215)", () => {
	it("renders the question, options and live percentages from the polls cache", () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		client.setQueryData(CHAT_POLLS_KEY, { myVotes: {}, tallies: { "m-poll": [2, 1] } });
		render(<ChatBubblePoll message={pollMessage()} own={false} />, {
			wrapper: createWrapper(client),
		});

		expect(screen.getByText("Pizza w piątek?")).toBeDefined();
		// 2/3 = 67%, 1/3 = 33% — procenty zamiast liczby głosów per opcja.
		expect(screen.getByText("67%")).toBeDefined();
		expect(screen.getByText("33%")).toBeDefined();
		expect(screen.getByText("3 głosy")).toBeDefined();
		// Sekretność: żadnych nazwisk głosujących w UI.
		expect(screen.queryByText("Kasia")).toBeNull();
	});

	it("shows zero percentages before any votes", () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		client.setQueryData(CHAT_POLLS_KEY, { myVotes: {}, tallies: {} });
		render(<ChatBubblePoll message={pollMessage()} own={false} />, {
			wrapper: createWrapper(client),
		});

		expect(screen.getAllByText("0%")).toHaveLength(2);
		expect(screen.getByText("0 głosów")).toBeDefined();
	});

	it("votes on click: POST goes out, my vote is marked, tallies update from the response", async () => {
		// GET /polls (refetch na mount) i POST głosu — jeden stub z pełnym stanem.
		const fetchMock = vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/api/chat/polls")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: { myVotes: {}, tallies: { "m-poll": [2, 1] } } }),
				});
			}
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ data: { tallies: [2, 2], myVote: 1 } }),
			});
		});
		vi.stubGlobal("fetch", fetchMock);
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		client.setQueryData(CHAT_POLLS_KEY, { myVotes: {}, tallies: { "m-poll": [2, 1] } });
		const user = userEvent.setup();
		render(<ChatBubblePoll message={pollMessage()} own={false} />, {
			wrapper: createWrapper(client),
		});

		await user.click(screen.getByRole("button", { name: "Głosuj na: Nie" }));

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/chat/messages/m-poll/votes",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ optionIndex: 1 }),
			}),
		);
		// Mój głos podświetlony + liczniki z serwera w cache (broadcast je powtórzy).
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Głosuj na: Nie" }).getAttribute("aria-pressed")).toBe("true");
		});
		expect(client.getQueryData(CHAT_POLLS_KEY)).toEqual({
			myVotes: { "m-poll": 1 },
			tallies: { "m-poll": [2, 2] },
		});
	});

	it("marks an already cast vote from myVotes (restore after reload)", () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		client.setQueryData(CHAT_POLLS_KEY, { myVotes: { "m-poll": 0 }, tallies: { "m-poll": [2, 1] } });
		render(<ChatBubblePoll message={pollMessage()} own={false} />, {
			wrapper: createWrapper(client),
		});

		expect(screen.getByRole("button", { name: "Głosuj na: Tak" }).getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByRole("button", { name: "Głosuj na: Nie" }).getAttribute("aria-pressed")).toBe("false");
	});

	it("retracts the vote on a second click of the same option (HITL toggle)", async () => {
		const fetchMock = vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/api/chat/polls")) {
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({ data: { myVotes: { "m-poll": 1 }, tallies: { "m-poll": [2, 2] } } }),
				});
			}
			// Toggle: serwer usuwa głos — myVote null, liczniki spadają.
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ data: { tallies: [2, 1], myVote: null } }),
			});
		});
		vi.stubGlobal("fetch", fetchMock);
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		client.setQueryData(CHAT_POLLS_KEY, { myVotes: { "m-poll": 1 }, tallies: { "m-poll": [2, 2] } });
		const user = userEvent.setup();
		render(<ChatBubblePoll message={pollMessage()} own={false} />, {
			wrapper: createWrapper(client),
		});
		// Start: opcja „Nie" podświetlona jako mój głos.
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Głosuj na: Nie" }).getAttribute("aria-pressed")).toBe("true");
		});

		await user.click(screen.getByRole("button", { name: "Głosuj na: Nie" }));

		// Po toggle: podświetlenie znika, liczniki wracają do stanu bez mojego głosu.
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Głosuj na: Nie" }).getAttribute("aria-pressed")).toBe("false");
		});
		expect(client.getQueryData(CHAT_POLLS_KEY)).toEqual({
			myVotes: {},
			tallies: { "m-poll": [2, 1] },
		});
	});

	it("falls back to plain text when the payload is malformed", () => {
		const broken: ChatMessageItem = {
			...pollMessage(),
			payload: { options: "nie jest tablicą" },
		};
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		render(<ChatBubblePoll message={broken} own={false} />, { wrapper: createWrapper(client) });

		expect(screen.getByText("Pizza w piątek?")).toBeDefined();
		expect(screen.queryByRole("button", { name: "Głosuj na: Tak" })).toBeNull();
	});

	it("live update: a vote-update applied to the cache changes the rendered percentages", async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		client.setQueryData(CHAT_POLLS_KEY, { myVotes: {}, tallies: { "m-poll": [1, 0] } });
		render(<ChatBubblePoll message={pollMessage()} own={false} />, {
			wrapper: createWrapper(client),
		});
		expect(screen.getByText("100%")).toBeDefined();

		// Symulacja broadcastu WS z drugiego klienta (ten sam handler co useChatSocket).
		act(() => {
			applyPollVoteUpdate(client, { messageId: "m-poll", tallies: [1, 2] });
		});

		// 1/3 → 33%, 2/3 → 67% — po rerenderze z cache'a.
		await waitFor(() => {
			expect(screen.getByText("67%")).toBeDefined();
		});
	});
});
