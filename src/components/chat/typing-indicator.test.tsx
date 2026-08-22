// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu TypingIndicator (F3 #154):
// - Anonimowy wskaźnik „ktoś pisze…" — trzy pulsujące kropki + tekst, nad inputem.
// - Zawsze zamontowany (zarezerwowane miejsce — bez skoku layoutu); widoczność
//   przełączana fadem: data-visible + aria-hidden, klasa transition-opacity.
// - Brak jakiejkolwiek tożsamości piszącego (PRD: nigdy imiona).
import { render } from "@testing-library/react";
import { TypingIndicator } from "./typing-indicator";

function indicator(container: HTMLElement): HTMLElement {
	const el = container.querySelector("[data-typing-indicator]");
	expect(el).not.toBeNull();
	return el as HTMLElement;
}

describe("TypingIndicator", () => {
	it('shows „ktoś pisze…" with three pulsing dots when visible', () => {
		const { container } = render(<TypingIndicator visible />);

		const el = indicator(container);
		expect(el.getAttribute("data-visible")).toBe("true");
		// Widoczny = dostępny dla czytników ekranu.
		expect(el.getAttribute("aria-hidden")).toBe("false");
		expect(el.textContent).toContain("ktoś pisze…");

		const dots = el.querySelectorAll("[data-typing-dot]");
		expect(dots.length).toBe(3);
		// Animacja pulsowania żyje w klasie CSS (keyframes w typing-indicator.css).
		expect(dots[0]?.classList.contains("typing-dot")).toBe(true);
	});

	it("hides with a fade (kept mounted, excluded from a11y) when not visible", () => {
		const { container } = render(<TypingIndicator visible={false} />);

		const el = indicator(container);
		expect(el.getAttribute("data-visible")).toBe("false");
		expect(el.getAttribute("aria-hidden")).toBe("true");
		// Fade in/out = przezroczystość, nie montowanie — brak skoku layoutu.
		expect(el.classList.contains("transition-opacity")).toBe(true);
		expect(el.classList.contains("opacity-0")).toBe(true);
	});

	it("never exposes any typing user identity", () => {
		const { container } = render(<TypingIndicator visible />);
		// Anonimowość: jedyny tekst wskaźnika to stałe „ktoś pisze…" (PRD).
		expect(indicator(container).textContent).toBe("ktoś pisze…");
	});
});
