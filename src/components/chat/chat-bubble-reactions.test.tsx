// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactionType } from "@/db/post-reactions/table";
import { ChatBubbleReactions, maxVisibleReactions } from "./chat-bubble-reactions";
import { CHAT_REACTIONS_KEY, type ChatReactionItem, useChatReactions } from "./chat-reactions";

/**
 * Założenia (rewizja HITL #161): małe emoji reakcji na dymku czatu — tylko
 * te dane przez INNYCH (moja ma zielony ring w pickerze), typy bez duplikatów
 * w kolejności konfigu, w rzędzie od rogu dymka; liczba zależna od szerokości
 * dymka (nigdy nie wystają — overflow-hidden + cap).
 * jsdom: clientWidth = 0 → cap = 1 (pierwsza emoji z rzędu).
 */

function reactionItem(userId: string, reaction: ReactionType, name = userId): ChatReactionItem {
	return { messageId: "m1", userId, reaction, user: { id: userId, name } };
}

function createClient(seed: ChatReactionItem[] = []) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(CHAT_REACTIONS_KEY, seed);
	return client;
}

// Harness — komponent czyta reakcje przez hook jak prawdziwy dymek.
function Probe({ currentUserId }: { currentUserId: string }) {
	const reactions = useChatReactions("m1");
	return (
		<div>
			<span data-probe-count>{reactions.length}</span>
			<ChatBubbleReactions messageId="m1" currentUserId={currentUserId} />
		</div>
	);
}

function renderProbe(client: QueryClient, currentUserId = "u1") {
	return render(
		<QueryClientProvider client={client}>
			<Probe currentUserId={currentUserId} />
		</QueryClientProvider>,
	);
}

describe("maxVisibleReactions", () => {
	it("derives the cap from the bubble width (min 1, max 5)", () => {
		expect(maxVisibleReactions(0)).toBe(1);
		expect(maxVisibleReactions(20)).toBe(1);
		expect(maxVisibleReactions(40)).toBe(1);
		expect(maxVisibleReactions(80)).toBe(2);
		expect(maxVisibleReactions(200)).toBe(5);
		expect(maxVisibleReactions(9999)).toBe(5);
	});
});

describe("ChatBubbleReactions", () => {
	it("renders nothing when only my own reaction exists", () => {
		const client = createClient([reactionItem("u1", "heart", "Tomek")]);
		const { container } = renderProbe(client);
		expect(container.querySelector("[data-chat-bubble-reactions]")).toBeNull();
	});

	it("shows others' distinct reaction emojis from the corner (capped by width)", () => {
		const client = createClient([
			reactionItem("u1", "heart", "Tomek"), // moja — NIE na dymku
			reactionItem("u2", "flame", "Kasia"),
			reactionItem("u3", "wow", "Ala"),
			reactionItem("u4", "sad", "Ola"),
		]);
		const { container } = renderProbe(client);

		const row = container.querySelector("[data-chat-bubble-reactions]");
		expect(row).not.toBeNull();
		const imgs = row?.querySelectorAll("img") ?? [];
		// jsdom: clientWidth = 0 → cap 1 → pierwsza z kolejności (flame;
		// heart pominięte — moje). overflow-hidden gwarantuje brak wystawania.
		expect(imgs.length).toBe(1);
		expect(imgs[0]?.getAttribute("src")).toBe("/emoji/flame.png");
	});

	it("renders in-flow inside the bubble row (self-end), never overlapping text", () => {
		const client = createClient([reactionItem("u2", "flame", "Kasia")]);
		const { container } = renderProbe(client);
		const row = container.querySelector("[data-chat-bubble-reactions]");
		expect(row?.classList.contains("self-end")).toBe(true);
		expect(row?.classList.contains("overflow-hidden")).toBe(true);
	});
});
