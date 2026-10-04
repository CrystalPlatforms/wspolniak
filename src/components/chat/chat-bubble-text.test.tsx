// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu ChatBubbleText (#214 — Chat F1):
// - Tekst wiadomości parsowany przez parseLinkTokens; tokeny renderują się
//   jako klikalne chipy (kotwice) z ODWROTNYM tłem: bg-foreground +
//   text-background (w jasnym trybie = czarne, w ciemnym = białe —theme-aware).
// - Chip: href = URL tokenu, target="_blank", rel="noopener noreferrer".
// - Fragmenty poza tokenami: highlightMentions jak dotychczas (#168) — chip
//   nie psuje wyróżnienia mentionów.
// - Błąd parsowania niemożliwy: tekst bez http(s) zostaje tekstem (patrz
//   link-tokens.test.ts).
import { cleanup, render, screen } from "@testing-library/react";
import { ChatBubbleText } from "./chat-bubble-text";

describe("ChatBubbleText — link chips (#214)", () => {
	afterEach(() => cleanup());

	it("renders a link token as a clickable chip", () => {
		render(<ChatBubbleText text="Zobacz [|kliknij](https://example.com)" own={false} />);

		const chip = screen.getByRole("link", { name: "kliknij" });
		expect(chip.getAttribute("href")).toBe("https://example.com");
		expect(chip.getAttribute("target")).toBe("_blank");
		expect(chip.getAttribute("rel")).toBe("noopener noreferrer");
	});

	it("chip uses inverted background classes in both themes", () => {
		render(<ChatBubbleText text="[|](https://example.com)" own />);

		const chip = screen.getByRole("link");
		expect(chip.className).toContain("bg-foreground");
		expect(chip.className).toContain("text-background");
	});

	it("keeps plain text and mentions around the chip", () => {
		render(<ChatBubbleText text="Hej @Ania [|link](https://x.pl) koniec" own={false} />);

		expect(screen.getByRole("link", { name: "link" })).toBeTruthy();
		expect(screen.getByText("@Ania")).toBeTruthy();
		expect(screen.getByText("Hej")).toBeTruthy();
		expect(screen.getByText("koniec")).toBeTruthy();
	});
});
