// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactionType } from "@/db/post-reactions/table";
import { ChatBubbleReactions, maxVisibleReactions } from "./chat-bubble-reactions";
import { CHAT_REACTIONS_KEY, type ChatReactionItem, useChatReactions } from "./chat-reactions";

/**
 * Założenia (revizja usera 2026-08-28, #161): małe emoji reakcji na dymku czatu —
 * WSZYSTKIE (także własne: reakcja ma być od razu widoczna na wiadomości),
 * typy bez duplikatów w kolejności konfigu, w rzędzie od rogu dymka; liczba
 * zależna od szerokości dymka (overflow-hidden + cap).
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
function Probe() {
	const reactions = useChatReactions("m1");
	return (
		<div>
			<span data-probe-count>{reactions.length}</span>
			<ChatBubbleReactions messageId="m1" />
		</div>
	);
}

function renderProbe(client: QueryClient) {
	return render(
		<QueryClientProvider client={client}>
			<Probe />
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
	// Revizja usera: reakcja ma być widoczna od razu — także własna (wcześniej
	// dymek pokazywał tylko cudze i solo-test wyglądał jak bug).
	it("shows my own reaction on the bubble immediately", () => {
		const client = createClient([reactionItem("u1", "heart", "Tomek")]);
		const { container } = renderProbe(client);
		const row = container.querySelector("[data-chat-bubble-reactions]");
		expect(row).not.toBeNull();
		const imgs = row?.querySelectorAll("img") ?? [];
		expect(imgs.length).toBe(1);
		expect(imgs[0]?.getAttribute("src")).toBe("/emoji/heart.png");
	});

	it("shows all distinct reaction emojis (capped by bubble width)", () => {
		const client = createClient([
			reactionItem("u1", "heart", "Tomek"), // moja — też na dymku
			reactionItem("u2", "flame", "Kasia"),
			reactionItem("u3", "wow", "Ala"),
			reactionItem("u4", "sad", "Ola"),
		]);
		const { container } = renderProbe(client);

		const row = container.querySelector("[data-chat-bubble-reactions]");
		expect(row).not.toBeNull();
		const imgs = row?.querySelectorAll("img") ?? [];
		// jsdom: clientWidth = 0 → cap 1 → pierwsza z kolejności konfigu (heart).
		// overflow-hidden gwarantuje brak wystawania poza dymek.
		expect(imgs.length).toBe(1);
		expect(imgs[0]?.getAttribute("src")).toBe("/emoji/heart.png");
	});

	it("renders in-flow inside the bubble row (self-end), never overlapping text", () => {
		const client = createClient([reactionItem("u2", "flame", "Kasia")]);
		const { container } = renderProbe(client);
		const row = container.querySelector("[data-chat-bubble-reactions]");
		expect(row?.classList.contains("self-end")).toBe(true);
		expect(row?.classList.contains("overflow-hidden")).toBe(true);
	});
});
