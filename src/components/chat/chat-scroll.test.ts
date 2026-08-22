// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu scrolla (F2 #153, PRD: auto-scroll w ~100px od dna):
// - isNearBottom(el, threshold=100): odległość od dna (scrollHeight - scrollTop
//   - clientHeight) <= threshold → true; brak elementu → true (bezpieczny fallback
//   = auto-scroll, żeby nie zgubić nowych wiadomości).
// - scrollToBottom(el): woła el.scrollTo({top: el.scrollHeight}) — smooth w UI.
import { isNearBottom, scrollToBottom } from "./chat-scroll";

function mockElement(scroll: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
	const el = document.createElement("div");
	Object.defineProperty(el, "scrollTop", { value: scroll.scrollTop, configurable: true });
	Object.defineProperty(el, "scrollHeight", { value: scroll.scrollHeight, configurable: true });
	Object.defineProperty(el, "clientHeight", { value: scroll.clientHeight, configurable: true });
	el.scrollTo = vi.fn();
	return el;
}

describe("isNearBottom", () => {
	it("returns true within ~100px of the bottom (default threshold)", () => {
		// distance = scrollHeight - scrollTop - clientHeight; max scrollTop = 600.
		// scrollTop 520 → 80px od dna (blisko); 450 → 150px (daleko).
		expect(
			isNearBottom(mockElement({ scrollTop: 520, scrollHeight: 1000, clientHeight: 400 })),
		).toBe(true);
		expect(
			isNearBottom(mockElement({ scrollTop: 450, scrollHeight: 1000, clientHeight: 400 })),
		).toBe(false);
	});

	it("is exactly at the threshold boundary (<= 100 counts as near)", () => {
		expect(
			isNearBottom(mockElement({ scrollTop: 500, scrollHeight: 1000, clientHeight: 400 })),
		).toBe(true);
		expect(
			isNearBottom(mockElement({ scrollTop: 499, scrollHeight: 1000, clientHeight: 400 })),
		).toBe(false);
	});

	it("returns true without an element (fallback = auto-scroll, never lose messages)", () => {
		expect(isNearBottom(null)).toBe(true);
	});
});

describe("scrollToBottom", () => {
	it("scrolls the element to its full height", () => {
		const el = mockElement({ scrollTop: 0, scrollHeight: 1234, clientHeight: 400 });
		scrollToBottom(el);
		expect(el.scrollTo).toHaveBeenCalledWith({ top: 1234, behavior: "smooth" });
	});
});
