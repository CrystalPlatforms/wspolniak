// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactionType } from "@/db/post-reactions/table";
import { ChatBubbleReactions, maxVisibleReactions } from "./chat-bubble-reactions";
import { CHAT_REACTIONS_KEY, type ChatReactionItem, useChatReactions } from "./chat-reactions";

/**
 * Założenia (#231): podgląd reakcji na dymku = pigułka BubbleReactions (shadcn,
 * base-rhea) nałożona na dolną krawędź dymka (side=bottom). Zewnętrzny róg
 * zależy od strony wiadomości: own → align=end (prawy), cudza → align=start
 * (lewy) — jak dotychczas. Emoji WSZYSTKICH (także własne: reakcja ma być od
 * razu widoczna), typy bez duplikatów w kolejności konfigu, cap wg szerokości
 * dymka (revizja #161 zostaje). Pigułka dekoracyjna (nieklikalna — dialog
 * „Kto zareagował" z menu dymka) z polskim aria-label wg wzoru z docs shadcn.
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
function Probe({ own }: { own: boolean }) {
	const reactions = useChatReactions("m1");
	return (
		<div>
			<span data-probe-count>{reactions.length}</span>
			<ChatBubbleReactions messageId="m1" own={own} />
		</div>
	);
}

function renderProbe(client: QueryClient, own = true) {
	return render(
		<QueryClientProvider client={client}>
			<Probe own={own} />
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
	// Revizja usera (#161): reakcja ma być widoczna od razu — także własna.
	it("shows my own reaction as a pill anchored to the bubble's bottom-right edge", () => {
		const client = createClient([reactionItem("u1", "heart", "Tomek")]);
		const { container } = renderProbe(client, true);
		const pill = container.querySelector("[data-chat-bubble-reactions]");
		expect(pill).not.toBeNull();
		expect(pill?.getAttribute("data-slot")).toBe("bubble-reactions");
		expect(pill?.getAttribute("data-side")).toBe("bottom");
		expect(pill?.getAttribute("data-align")).toBe("end");
		const imgs = pill?.querySelectorAll("img") ?? [];
		expect(imgs.length).toBe(1);
		expect(imgs[0]?.getAttribute("src")).toBe("/emoji/heart.png");
	});

	// Zewnętrzny róg dymka: cudza wiadomość siedzi po lewej → pigułka przy lewym rogu.
	it("anchors to the outer left corner on someone else's message", () => {
		const client = createClient([reactionItem("u2", "flame", "Kasia")]);
		const { container } = renderProbe(client, false);
		const pill = container.querySelector("[data-chat-bubble-reactions]");
		expect(pill?.getAttribute("data-align")).toBe("start");
	});

	// Docs shadcn: rząd emoji jako jedno `role=img` z opisem — czytnik czyta całość raz.
	it("labels the pill for screen readers with Polish reaction names", () => {
		const client = createClient([
			reactionItem("u1", "heart", "Tomek"),
			reactionItem("u2", "flame", "Kasia"),
		]);
		const { container } = renderProbe(client);
		const pill = container.querySelector("[data-chat-bubble-reactions]");
		expect(pill?.getAttribute("role")).toBe("img");
		expect(pill?.getAttribute("aria-label")).toBe("Reakcje: serce, ogień");
	});

	it("renders nothing when the message has no reactions", () => {
		const client = createClient([]);
		const { container } = renderProbe(client);
		expect(container.querySelector("[data-chat-bubble-reactions]")).toBeNull();
	});

	it("shows all distinct reaction emojis (capped by bubble width)", () => {
		const client = createClient([
			reactionItem("u1", "heart", "Tomek"), // moja — też na dymku
			reactionItem("u2", "flame", "Kasia"),
			reactionItem("u3", "wow", "Ala"),
			reactionItem("u4", "sad", "Ola"),
		]);
		const { container } = renderProbe(client);

		const pill = container.querySelector("[data-chat-bubble-reactions]");
		expect(pill).not.toBeNull();
		const imgs = pill?.querySelectorAll("img") ?? [];
		// jsdom: clientWidth = 0 → cap 1 → pierwsza z kolejności konfigu (heart).
		expect(imgs.length).toBe(1);
		expect(imgs[0]?.getAttribute("src")).toBe("/emoji/heart.png");
	});
});
