// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu ComposerPollDialog (#241, reviza usera: dialog zamiast sekcji):
// - otwarcie startuje od kopii zapisanego szkicu (albo pustej ankiety);
// - "Zapisz ankietę" waliduje schematem wysyłki: poprawny -> onSave + domknięcie,
//   błędny -> komunikat (role=alert) i dialog zostaje otwarty;
// - "Anuluj" domyka dialog BEZ zapisu (zmiany w kopii przepadają);
// - opcje: 2-6, dodawanie/usuwanie, limity znaków (pytanie 200, opcja 100).
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComposerPollDialog, type PollDraft, pollDraftError } from "./composer-poll-section";

afterEach(() => {
	cleanup();
});

function renderOpen(value: PollDraft | null = null) {
	const onOpenChange = vi.fn();
	const onSave = vi.fn();
	render(<ComposerPollDialog open onOpenChange={onOpenChange} value={value} onSave={onSave} />);
	return { onOpenChange, onSave };
}

describe("ComposerPollDialog", () => {
	it("otwarty dialog pokazuje pytanie i dwie opcje startowe", async () => {
		renderOpen();
		expect(await screen.findByLabelText("Pytanie")).toBeDefined();
		expect(screen.getByLabelText("Opcja 1")).toBeDefined();
		expect(screen.getByLabelText("Opcja 2")).toBeDefined();
	});

	it("otwarcie od kopii zapisanego szkicu (edycja)", async () => {
		renderOpen({ question: "Gdzie?", options: ["A", "B", "C"] });
		const question = await screen.findByLabelText("Pytanie");
		expect((question as HTMLInputElement).value).toBe("Gdzie?");
		expect((screen.getByLabelText("Opcja 3") as HTMLInputElement).value).toBe("C");
	});

	it("Zapisz: poprawna ankieta -> onSave z danymi + domknięcie", async () => {
		const user = userEvent.setup();
		const { onSave, onOpenChange } = renderOpen();
		await user.type(await screen.findByLabelText("Pytanie"), "Gdzie na wakacje?");
		await user.type(screen.getByLabelText("Opcja 1"), "Morze");
		await user.type(screen.getByLabelText("Opcja 2"), "Góry");
		await user.click(screen.getByRole("button", { name: /zapisz ankietę/i }));

		expect(onSave).toHaveBeenCalledWith({
			question: "Gdzie na wakacje?",
			options: ["Morze", "Góry"],
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("Zapisz: błędna ankieta -> komunikat i dialog zostaje otwarty", async () => {
		const user = userEvent.setup();
		const { onSave, onOpenChange } = renderOpen();
		await user.type(await screen.findByLabelText("Pytanie"), "Pytanie");
		// jedna opcja pusta -> walidacja nie przechodzi
		await user.type(screen.getByLabelText("Opcja 1"), "Morze");
		await user.click(screen.getByRole("button", { name: /zapisz ankietę/i }));

		expect(await screen.findByRole("alert")).toBeDefined();
		expect(onSave).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("Anuluj: domyka bez zapisu", async () => {
		const user = userEvent.setup();
		const { onSave, onOpenChange } = renderOpen();
		await user.type(await screen.findByLabelText("Pytanie"), "Cokolwiek");
		await user.click(screen.getByRole("button", { name: /anuluj/i }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onSave).not.toHaveBeenCalled();
	});

	it("opcje: dodawanie do 6, usuwanie krzyżykiem", async () => {
		const user = userEvent.setup();
		renderOpen({ question: "Pytanie", options: ["A", "B"] });

		await user.click(screen.getByRole("button", { name: /dodaj opcję/i }));
		expect(screen.getByLabelText("Opcja 3")).toBeDefined();

		await user.click(screen.getByRole("button", { name: /usuń opcję 3/i }));
		expect(screen.queryByLabelText("Opcja 3")).toBeNull();
	});

	it("limity znaków: pytanie 200, opcja 100", async () => {
		renderOpen();
		expect(((await screen.findByLabelText("Pytanie")) as HTMLInputElement).maxLength).toBe(200);
		expect((screen.getByLabelText("Opcja 1") as HTMLInputElement).maxLength).toBe(100);
	});
});

describe("pollDraftError", () => {
	it("null dla poprawnego szkicu", () => {
		expect(pollDraftError({ question: "Pytanie", options: ["A", "B"] })).toBeNull();
	});

	it("komunikat wskazuje numer pustej opcji", () => {
		expect(pollDraftError({ question: "Pytanie", options: ["A", ""] })).toMatch(/opcja 2/i);
	});
});
