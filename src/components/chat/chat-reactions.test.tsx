// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu reakcji czatu po stronie klienta (F4 #155):
// - ChatReactionItem identyfikuje się TRÓJKĄ (messageId, userId, reaction) —
//   tożsamość lokalna (UNIQUE w DB); własny broadcast echa nie dubluje (dedupe).
// - applyReactionEvent(list, event): added → doklejka jeśli trójki nie ma;
//   removed → odfiltrowanie trójki. Czysta funkcja — używana przez WS handler
//   i przez optymistyczną mutację w ChatReactionBar.
// - CHAT_REACTIONS_KEY — współdzielony klucz cache listy reakcji.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	applyReactionEvent,
	CHAT_REACTIONS_KEY,
	ChatReactionBar,
	type ChatReactionBarProps,
	type ChatReactionEvent,
	type ChatReactionItem,
} from "./chat-reactions";

function added(overrides: Partial<ChatReactionEvent> = {}): ChatReactionEvent {
	return {
		messageId: "m-1",
		reaction: "heart",
		action: "added",
		user: { id: "u2", name: "Kasia" },
		...overrides,
	};
}

describe("applyReactionEvent", () => {
	it("appends an added reaction with the reacting user", () => {
		const result = applyReactionEvent(undefined, added());

		expect(result).toEqual([
			{ messageId: "m-1", userId: "u2", reaction: "heart", user: { id: "u2", name: "Kasia" } },
		]);
	});

	it("ignores a duplicate of the same (message,user,reaction) triple — own echo", () => {
		const list = applyReactionEvent(undefined, added());

		const again = applyReactionEvent(list, added());

		expect(again).toHaveLength(1);
		expect(again).toBe(list); // bez zmian → ta sama referencja (bez zbędnego renderu)
	});

	it("keeps other users' reactions when filtering a removed triple", () => {
		const base: ChatReactionItem[] = [
			{ messageId: "m-1", userId: "u2", reaction: "heart", user: { id: "u2", name: "Kasia" } },
			{ messageId: "m-1", userId: "u3", reaction: "heart", user: { id: "u3", name: "Ala" } },
		];

		const result = applyReactionEvent(base, added({ action: "removed" }));

		expect(result).toEqual([
			{ messageId: "m-1", userId: "u3", reaction: "heart", user: { id: "u3", name: "Ala" } },
		]);
	});

	it("returns the same list reference when removing a non-existent triple", () => {
		const base: ChatReactionItem[] = [
			{ messageId: "m-1", userId: "u3", reaction: "heart", user: { id: "u3", name: "Ala" } },
		];

		const result = applyReactionEvent(base, added({ action: "removed" }));

		expect(result).toBe(base);
	});
});

describe("CHAT_REACTIONS_KEY", () => {
	it("is a stable chat-scoped reactions key", () => {
		expect(CHAT_REACTIONS_KEY).toEqual(["chat", "reactions"]);
	});
});

// ─── ChatReactionBar (komponent) ─────────────────────────────────────────────
// Założenia kontraktu UI:
// - Trzy przyciski (serce/śmiech/ogień, konfig z feedu), BEZ liczników.
// - Własna reakcja: aria-pressed + data-mine; klik = toggle (optymistyczny).
// - Dodanie montuje klasę chat-reaction-pop, usunięcie chat-reaction-fade-out.
// - contextmenu (prawy klik / przytrzymanie) na ikonie = lista kto zareagował.
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function reaction(overrides: Partial<ChatReactionItem> = {}): ChatReactionItem {
	return {
		messageId: "m-1",
		userId: "u2",
		reaction: "heart",
		user: { id: "u2", name: "Kasia" },
		...overrides,
	};
}

function createClient(seed: ChatReactionItem[] = []): QueryClient {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(CHAT_REACTIONS_KEY, seed);
	return client;
}

function renderBar(client: QueryClient, props: Partial<ChatReactionBarProps> = {}) {
	return render(
		<QueryClientProvider client={client}>
			<ChatReactionBar messageId="m-1" currentUserId="u1" currentUserName="Tomek" {...props} />
		</QueryClientProvider>,
	);
}

/** Stub fetcha — POST toggle domyślnie OK (konfigurowalny), nic innego nie wychodzi. */
function mockToggleFetch(ok = true) {
	const fetchMock = vi
		.fn()
		.mockImplementation(() =>
			Promise.resolve({ ok, json: () => Promise.resolve({ data: { action: "added" } }) }),
		);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("ChatReactionBar", () => {
	it("renders one icon per feed reaction type with no counters; own reaction highlighted", () => {
		const client = createClient([
			reaction({ userId: "u1", user: { id: "u1", name: "Tomek" } }),
			reaction({ reaction: "laugh" }),
		]);
		renderBar(client);

		const heart = screen.getByRole("button", { name: "serce" });
		const laugh = screen.getByRole("button", { name: "śmiech" });
		const flame = screen.getByRole("button", { name: "ogień" });
		// Własna reakcja podświetlona (aria-pressed + data-mine).
		expect(heart.getAttribute("aria-pressed")).toBe("true");
		expect(heart.getAttribute("data-mine")).toBe("true");
		expect(laugh.getAttribute("aria-pressed")).toBe("false");
		expect(laugh.getAttribute("data-mine")).toBe("false");
		expect(flame.getAttribute("aria-pressed")).toBe("false");
		// Bez liczników — żaden przycisk nie pokazuje cyfr.
		for (const button of [heart, laugh, flame]) {
			expect(button.textContent).not.toMatch(/\d/);
		}
	});

	it("tap on an unreacted type toggles optimistically with the pop animation class", async () => {
		const user = userEvent.setup();
		const client = createClient([]);
		const fetchMock = mockToggleFetch();
		renderBar(client);

		const heart = screen.getByRole("button", { name: "serce" });
		await user.click(heart);

		// POST z typem reakcji; optymistycznie podświetlone + klasa pop.
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/chat/messages/m-1/reactions",
			expect.objectContaining({ method: "POST" }),
		);
		expect(heart.getAttribute("aria-pressed")).toBe("true");
		expect(heart.classList.contains("chat-reaction-pop")).toBe(true);
	});

	it("tap on own reaction again removes it with the fade-out animation class", async () => {
		const user = userEvent.setup();
		const client = createClient([reaction({ userId: "u1", user: { id: "u1", name: "Tomek" } })]);
		const fetchMock = mockToggleFetch();
		renderBar(client);

		const heart = screen.getByRole("button", { name: "serce" });
		await user.click(heart);

		expect(fetchMock).toHaveBeenCalled();
		expect(heart.getAttribute("aria-pressed")).toBe("false");
		expect(heart.classList.contains("chat-reaction-fade-out")).toBe(true);
	});

	it("tapping a different type replaces my current reaction (only the new one pressed)", async () => {
		const user = userEvent.setup();
		const client = createClient([reaction({ userId: "u1", user: { id: "u1", name: "Tomek" } })]);
		mockToggleFetch();
		renderBar(client);

		const heart = screen.getByRole("button", { name: "serce" });
		const laugh = screen.getByRole("button", { name: "śmiech" });
		await user.click(laugh);

		// Stara zdejmuje, nowa wchodzi z popem — nigdy dwie naraz.
		expect(heart.getAttribute("aria-pressed")).toBe("false");
		expect(laugh.getAttribute("aria-pressed")).toBe("true");
		expect(laugh.classList.contains("chat-reaction-pop")).toBe(true);
	});

	it("rolls the optimistic toggle back when the request fails", async () => {
		const user = userEvent.setup();
		const client = createClient([]);
		mockToggleFetch(false);
		renderBar(client);

		const heart = screen.getByRole("button", { name: "serce" });
		await user.click(heart);

		await waitFor(() => {
			expect(heart.getAttribute("aria-pressed")).toBe("false");
		});
	});

	it("contextmenu on an icon opens the who-reacted dialog with names", async () => {
		const client = createClient([
			reaction({ userId: "u1", user: { id: "u1", name: "Tomek" } }),
			reaction(),
		]);
		mockToggleFetch();
		renderBar(client);

		fireEvent.contextMenu(screen.getByRole("button", { name: "serce" }));

		expect(await screen.findByText("Tomek")).toBeDefined();
		expect(screen.getByText("Kasia")).toBeDefined();
	});
});
