// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu reakcji czatu po stronie klienta (F4 #155, Reactions 3.0):
// - ChatReactionItem identyfikuje się TRÓJKĄ (messageId, userId, reaction) —
//   tożsamość lokalna (UNIQUE w DB); własny broadcast echa nie dubluje (dedupe).
// - applyReactionEvent(list, event): added → doklejka jeśli trójki nie ma;
//   removed → odfiltrowanie trójki. Czysta funkcja — używana przez WS handler
//   i przez optymistyczną mutację w useToggleChatReaction.
// - CHAT_REACTIONS_KEY — współdzielony klucz cache listy reakcji.
// - useToggleChatReaction — optymistyczny toggle pod pill „Zareaguj" w menu.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
	applyReactionEvent,
	CHAT_REACTIONS_KEY,
	type ChatReactionEvent,
	type ChatReactionItem,
	useToggleChatReaction,
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

// ─── useToggleChatReaction (hook pod pill reakcji w menu czatu) ───────────────
// Założenia kontraktu: toggle optymistyczny na wspólnym kluczu CHAT_REACTIONS_KEY
// (dodanie / usunięcie / zamiana na inny typ), rollback po błędzie, POST na
// endpoint wiadomości. UI (pill) renderuje ChatBubbleMenu.
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

function renderToggleHook(client: QueryClient) {
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	return renderHook(() => useToggleChatReaction("m-1", "u1", "Tomek"), { wrapper });
}

describe("useToggleChatReaction", () => {
	it("optimistically adds my reaction to the shared cache", async () => {
		const fetchMock = mockToggleFetch();
		const client = createClient([]);
		const { result } = renderToggleHook(client);

		await act(async () => result.current.mutate("heart"));

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/chat/messages/m-1/reactions",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ reaction: "heart" }),
			}),
		);
		const cache = client.getQueryData<ChatReactionItem[]>(CHAT_REACTIONS_KEY) ?? [];
		expect(cache.some((r) => r.userId === "u1" && r.reaction === "heart")).toBe(true);
	});

	it("optimistically removes my reaction when toggling the same type", async () => {
		mockToggleFetch();
		const client = createClient([reaction({ userId: "u1", user: { id: "u1", name: "Tomek" } })]);
		const { result } = renderToggleHook(client);

		await act(async () => result.current.mutate("heart"));

		const cache = client.getQueryData<ChatReactionItem[]>(CHAT_REACTIONS_KEY) ?? [];
		expect(cache.some((r) => r.userId === "u1")).toBe(false);
	});

	it("replaces my current reaction with the new type (one per user)", async () => {
		mockToggleFetch();
		const client = createClient([
			reaction({ userId: "u1", reaction: "heart", user: { id: "u1", name: "Tomek" } }),
		]);
		const { result } = renderToggleHook(client);

		await act(async () => result.current.mutate("flame"));

		const cache = client.getQueryData<ChatReactionItem[]>(CHAT_REACTIONS_KEY) ?? [];
		const mine = cache.filter((r) => r.userId === "u1");
		expect(mine).toHaveLength(1);
		expect(mine[0]?.reaction).toBe("flame");
	});

	it("rolls the optimistic toggle back when the request fails", async () => {
		mockToggleFetch(false);
		const client = createClient([]);
		const { result } = renderToggleHook(client);

		await act(async () => result.current.mutate("heart"));

		const cache = client.getQueryData<ChatReactionItem[]>(CHAT_REACTIONS_KEY) ?? [];
		expect(cache.some((r) => r.userId === "u1")).toBe(false);
	});
});
