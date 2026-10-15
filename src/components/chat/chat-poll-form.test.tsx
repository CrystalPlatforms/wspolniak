// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu ChatPollForm (F2 #215):
// - Start: pytanie + 2 puste pola opcji; „Dodaj opcję" do 6, krzyżyk do min. 2.
// - Walidacja schematem wysyłki (jedno źródło prawdy z serwerem): puste pytanie
//   albo niepuste pola opcji blokują zapis widocznym komunikatem (role=alert).
// - Zapis → onSave({question, options}) trimmed; Enter w polu = zapis
//   (preventDefault — nie wysyła czatu), Escape = anuluj.
// - pending → przycisk zablokowany.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPollForm } from "./chat-poll-form";

afterEach(() => {
	cleanup();
});

describe("ChatPollForm UI (F2 #215)", () => {
	it("starts with a question field and exactly two option fields", () => {
		render(<ChatPollForm onSave={vi.fn()} onCancel={vi.fn()} />);

		expect(screen.getByLabelText("Pytanie")).toBeDefined();
		expect(screen.getByLabelText("Opcja 1")).toBeDefined();
		expect(screen.getByLabelText("Opcja 2")).toBeDefined();
		expect(screen.queryByLabelText("Opcja 3")).toBeNull();
	});

	it("blocks saving with a visible message when the question is empty", async () => {
		const onSave = vi.fn();
		const user = userEvent.setup();
		render(<ChatPollForm onSave={onSave} onCancel={vi.fn()} />);

		await user.type(screen.getByLabelText("Opcja 1"), "Tak");
		await user.type(screen.getByLabelText("Opcja 2"), "Nie");
		await user.click(screen.getByRole("button", { name: "Wyślij ankietę" }));

		expect(screen.getByRole("alert")).toBeDefined();
		expect(onSave).not.toHaveBeenCalled();
	});

	it("blocks saving when an option is left empty (points at the offending row)", async () => {
		const onSave = vi.fn();
		const user = userEvent.setup();
		render(<ChatPollForm onSave={onSave} onCancel={vi.fn()} />);

		await user.type(screen.getByLabelText("Pytanie"), "Pytanie?");
		await user.type(screen.getByLabelText("Opcja 1"), "Tak");
		// Opcja 2 pusta → błąd i podświetlenie wiersza (aria-invalid).
		await user.click(screen.getByRole("button", { name: "Wyślij ankietę" }));

		expect(screen.getByRole("alert")).toBeDefined();
		expect(screen.getByLabelText("Opcja 2").getAttribute("aria-invalid")).toBe("true");
		expect(onSave).not.toHaveBeenCalled();
	});

	it("adds option fields up to six, then hides the add button", async () => {
		const user = userEvent.setup();
		render(<ChatPollForm onSave={vi.fn()} onCancel={vi.fn()} />);

		for (let i = 3; i <= 6; i += 1) {
			await user.click(screen.getByRole("button", { name: "Dodaj opcję" }));
			expect(screen.getByLabelText(`Opcja ${i}`)).toBeDefined();
		}
		expect(screen.queryByRole("button", { name: "Dodaj opcję" })).toBeNull();
	});

	it("removes an option field but never drops below two", async () => {
		const user = userEvent.setup();
		render(<ChatPollForm onSave={vi.fn()} onCancel={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Dodaj opcję" }));
		expect(screen.getByLabelText("Opcja 3")).toBeDefined();

		await user.click(screen.getByRole("button", { name: "Usuń opcję 3" }));
		expect(screen.queryByLabelText("Opcja 3")).toBeNull();

		// Przy minimum dwóch pól krzyżyki znikają (nie da się zejść poniżej 2).
		expect(screen.queryByRole("button", { name: "Usuń opcję 1" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Usuń opcję 2" })).toBeNull();
	});

	it("saves the trimmed question and options on success", async () => {
		const onSave = vi.fn();
		const user = userEvent.setup();
		render(<ChatPollForm onSave={onSave} onCancel={vi.fn()} />);

		await user.type(screen.getByLabelText("Pytanie"), "  Pizza w piątek?  ");
		await user.type(screen.getByLabelText("Opcja 1"), "Tak ");
		await user.type(screen.getByLabelText("Opcja 2"), "Nie");
		await user.click(screen.getByRole("button", { name: "Wyślij ankietę" }));

		expect(onSave).toHaveBeenCalledWith({
			question: "Pizza w piątek?",
			options: ["Tak", "Nie"],
		});
	});

	it("saves on Enter inside a field instead of submitting the chat form", async () => {
		const onSave = vi.fn();
		const user = userEvent.setup();
		render(<ChatPollForm onSave={onSave} onCancel={vi.fn()} />);

		await user.type(screen.getByLabelText("Pytanie"), "Pytanie?");
		await user.type(screen.getByLabelText("Opcja 1"), "Tak");
		await user.type(screen.getByLabelText("Opcja 2"), "Nie{Enter}");

		expect(onSave).toHaveBeenCalledTimes(1);
	});

	it("cancels on Escape without saving", async () => {
		const onSave = vi.fn();
		const onCancel = vi.fn();
		const user = userEvent.setup();
		render(<ChatPollForm onSave={onSave} onCancel={onCancel} />);

		await user.type(screen.getByLabelText("Pytanie"), "{Escape}");

		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onSave).not.toHaveBeenCalled();
	});

	it("disables the submit button while sending", () => {
		render(<ChatPollForm onSave={vi.fn()} onCancel={vi.fn()} pending />);

		const submit = screen.getByRole("button", { name: "Wysyłanie…" }) as HTMLButtonElement;
		expect(submit.disabled).toBe(true);
	});
});
