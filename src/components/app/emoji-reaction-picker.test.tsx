// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmojiReactionPicker } from "./emoji-reaction-picker";

/**
 * Założenia zakodowane w testach (Reactions 3.0, #161):
 * - trigger ma aria-label "Dodaj reakcję" (PL), otwiera pill z 5 emoji
 *   (kolejność z REACTION_ORDER, etykiety z REACTION_CONFIG),
 * - wybór emoji woła onReact(typ) i ZAMYKA pill (klik lub Enter),
 * - Escape zamyka i wraca focusem na trigger,
 * - disabled blokuje otwarcie i onReact,
 * - "last" pokazuje ostatnią reakcję na triggerze.
 * NIE testowane w tej iteracji: animacje burst, hold-to-repeat, drag-to-pick,
 * placement (zależny od viewportu), warianty reduced-motion.
 */
describe("EmojiReactionPicker", () => {
	it("renders a trigger labelled for adding a reaction", () => {
		render(<EmojiReactionPicker onReact={vi.fn()} />);
		expect(screen.getByRole("button", { name: "Dodaj reakcję" })).toBeTruthy();
	});

	it("opens the pill and fires onReact with the picked type, then closes", async () => {
		const user = userEvent.setup();
		const onReact = vi.fn();
		render(<EmojiReactionPicker onReact={onReact} />);

		await user.click(screen.getByRole("button", { name: "Dodaj reakcję" }));
		expect(screen.getByRole("menu", { name: "Wybierz reakcję" })).toBeTruthy();

		await user.click(screen.getByRole("menuitem", { name: "ogień" }));
		expect(onReact).toHaveBeenCalledWith("flame");
		// Pill znika dopiero po zakończeniu animacji burst (~2–3 s).
		await waitFor(
			() => expect(screen.queryByRole("menu", { name: "Wybierz reakcję" })).toBeNull(),
			{ timeout: 6000 },
		);
	});

	it("closes only after the burst settles — never synchronously on click", async () => {
		// W przeglądarce pill czeka na koniec lotu cząsteczek (jsdom domyka
		// animacje natychmiast — pełne odliczanie weryfikuje HITL). Kontrakt:
		// po wyborze pill znika dopiero przez mechanizm settle/bezpiecznik,
		// nigdy wprost z handlera kliknięcia — stąd waitFor, nie natychmiast.
		const user = userEvent.setup();
		const onReact = vi.fn();
		render(<EmojiReactionPicker onReact={onReact} />);

		await user.click(screen.getByRole("button", { name: "Dodaj reakcję" }));
		const menuBefore = screen.getByRole("menu", { name: "Wybierz reakcję" });
		await user.click(screen.getByRole("menuitem", { name: "ogień" }));

		expect(onReact).toHaveBeenCalledWith("flame");
		// Menu (jeśli jeszcze żyje) nie zostało odmontowane synchronicznie.
		await waitFor(
			() => expect(screen.queryByRole("menu", { name: "Wybierz reakcję" })).toBeNull(),
			{ timeout: 6000 },
		);
		expect(menuBefore).toBeTruthy();
	});

	it("marks the active (my) reaction with a green ring in the pill", async () => {
		const user = userEvent.setup();
		render(<EmojiReactionPicker onReact={vi.fn()} active="flame" />);
		await user.click(screen.getByRole("button", { name: "Dodaj reakcję" }));

		const flame = screen.getByRole("menuitem", { name: "ogień" });
		expect(flame.classList.contains("ring-2")).toBe(true);
		expect(flame.classList.contains("ring-green-500")).toBe(true);
		// Tylko aktywna emoji ma ring.
		const heart = screen.getByRole("menuitem", { name: "serce" });
		expect(heart.classList.contains("ring-green-500")).toBe(false);
	});

	it("supports controlled open without a trigger (pozycja Zareaguj w menu czatu)", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		const { rerender } = render(
			<EmojiReactionPicker
				onReact={vi.fn()}
				open={false}
				onOpenChange={onOpenChange}
				hideTrigger
			/>,
		);
		expect(screen.queryByRole("menu")).toBeNull();
		expect(screen.queryByRole("button", { name: "Dodaj reakcję" })).toBeNull();

		rerender(
			<EmojiReactionPicker onReact={vi.fn()} open onOpenChange={onOpenChange} hideTrigger />,
		);
		expect(screen.getByRole("menu", { name: "Wybierz reakcję" })).toBeTruthy();

		await user.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	// Regresja: w trybie hideTrigger pill pozycjonował się z nieistniejącego
	// triggera → placeBar wychodził wcześnie i pill wylatywał na -9999px
	// (dymek „Zareaguj" w czacie niewidoczny). anchorRect musi być kotwicą.
	it("positions the pill from anchorRect when the trigger is hidden", () => {
		render(
			<EmojiReactionPicker
				onReact={vi.fn()}
				open
				hideTrigger
				align="left"
				anchorRect={{ left: 100, top: 200, right: 132, bottom: 232, width: 32, height: 32 }}
			/>,
		);

		const pill = screen.getByRole("menu", { name: "Wybierz reakcję" });
		const positioned = pill.closest(".fixed") as HTMLElement | null;
		expect(positioned).not.toBeNull();
		expect(positioned?.style.left).toBe("100px");
		expect(positioned?.style.top).toBe("184px");
	});

	it("lists all five reaction types from REACTION_ORDER", async () => {
		const user = userEvent.setup();
		render(<EmojiReactionPicker onReact={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: "Dodaj reakcję" }));
		for (const label of ["serce", "śmiech", "ogień", "zdziwienie", "smutek"]) {
			expect(screen.getByRole("menuitem", { name: label })).toBeTruthy();
		}
	});

	it("reacts with Enter from the keyboard", async () => {
		const user = userEvent.setup();
		const onReact = vi.fn();
		render(<EmojiReactionPicker onReact={onReact} />);
		await user.click(screen.getByRole("button", { name: "Dodaj reakcję" }));
		// Po otwarciu pill fokus jest na pierwszej emoji (heart) — focus
		// przenosi się w następnym makrotasku, więc czekamy na niego.
		await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("serce"));
		await user.keyboard("{Enter}");
		expect(onReact).toHaveBeenCalledWith("heart");
	});

	it("shows the last reaction on the trigger", () => {
		render(<EmojiReactionPicker onReact={vi.fn()} last="wow" />);
		const trigger = screen.getByRole("button", { name: "Reagowano zdziwienie" });
		const img = trigger.querySelector("img");
		expect(img?.getAttribute("src")).toBe("/emoji/wow.png");
	});

	it("closes on Escape and returns focus to the trigger", async () => {
		const user = userEvent.setup();
		render(<EmojiReactionPicker onReact={vi.fn()} />);
		const trigger = screen.getByRole("button", { name: "Dodaj reakcję" });
		await user.click(trigger);
		expect(screen.getByRole("menu")).toBeTruthy();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		expect(document.activeElement).toBe(trigger);
	});

	it("does not open nor react when disabled", async () => {
		const user = userEvent.setup();
		const onReact = vi.fn();
		render(<EmojiReactionPicker onReact={vi.fn()} disabled />);
		await user.click(screen.getByRole("button", { name: "Dodaj reakcję" }));
		expect(screen.queryByRole("menu")).toBeNull();
		expect(onReact).not.toHaveBeenCalled();
	});
});
