// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu ChatLinkForm (#214 — Chat F1):
// - Pola: Tytuł (opcjonalny), Adres URL (wymagany) — jedno pole tekstowe.
// - Pusty URL → widoczny komunikat (role=alert), no onSave.
// - Niepoprawny URL → komunikat, no onSave.
// - Zapis → onSave({ title, url }) trimmed + znormalizowany; Anuluj → onCancel.
//   Enter w polu = zapis (preventDefault — nie wysyła czatu).
// - Walidacja przez linkUrlError z link-tokens (jedno źródło prawdy).
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatLinkForm } from "./chat-link-form";

describe("ChatLinkForm UI", () => {
	afterEach(() => {
		cleanup();
	});

	it("blocks saving with a visible message when the URL is empty", async () => {
		const onSave = vi.fn();
		const user = userEvent.setup();
		render(<ChatLinkForm onSave={onSave} onCancel={() => {}} />);

		await user.click(screen.getByRole("button", { name: "Wstaw" }));

		expect(screen.getByRole("alert").textContent).toBe("Podaj adres URL");
		expect(onSave).not.toHaveBeenCalled();
	});

	it("blocks saving when the URL is unparseable", async () => {
		const onSave = vi.fn();
		const user = userEvent.setup();
		render(<ChatLinkForm onSave={onSave} onCancel={() => {}} />);

		await user.type(screen.getByLabelText("Adres URL"), "zły adres");
		await user.click(screen.getByRole("button", { name: "Wstaw" }));

		expect(screen.getByRole("alert").textContent).toBe("To nie jest poprawny adres URL");
		expect(onSave).not.toHaveBeenCalled();
	});

	it("saves a bare domain with https:// prepended", async () => {
		const onSave = vi.fn();
		const user = userEvent.setup();
		render(<ChatLinkForm onSave={onSave} onCancel={() => {}} />);

		await user.type(screen.getByLabelText("Adres URL"), "apple.com");
		await user.click(screen.getByRole("button", { name: "Wstaw" }));

		expect(onSave).toHaveBeenCalledWith({ title: "", url: "https://apple.com" });
	});

	it("saves a valid link with its title", async () => {
		const onSave = vi.fn();
		const user = userEvent.setup();
		render(<ChatLinkForm onSave={onSave} onCancel={() => {}} />);

		await user.type(screen.getByLabelText("Tytuł"), "Przepis");
		await user.type(screen.getByLabelText("Adres URL"), "https://example.com/x");
		await user.click(screen.getByRole("button", { name: "Wstaw" }));

		expect(onSave).toHaveBeenCalledWith({ title: "Przepis", url: "https://example.com/x" });
	});

	it("saves on Enter inside a field instead of submitting the chat form", async () => {
		const onSave = vi.fn();
		const onCancel = vi.fn();
		const user = userEvent.setup();
		render(<ChatLinkForm onSave={onSave} onCancel={onCancel} />);

		await user.type(screen.getByLabelText("Adres URL"), "https://example.com{Enter}");

		expect(onSave).toHaveBeenCalledWith({ title: "", url: "https://example.com" });
		expect(onCancel).not.toHaveBeenCalled();
	});

	it("closes the form on Escape", async () => {
		const onSave = vi.fn();
		const onCancel = vi.fn();
		const user = userEvent.setup();
		render(<ChatLinkForm onSave={onSave} onCancel={onCancel} />);

		await user.type(screen.getByLabelText("Adres URL"), "{Escape}");

		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onSave).not.toHaveBeenCalled();
	});
});
