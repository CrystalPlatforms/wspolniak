// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu ChatInput (#168 — @mentions w czacie):
// - Pole jednowierszowe czatu: wpisanie `@` (na początku lub po białym znaku)
//   otwiera listę członków rodziny z GET /api/app/users?q= (ten sam endpoint
//   co MentionInput postów/komentarzy); ciąg po `@` filtruje na żywo.
// - Enter na otwartej liście wstawia `@imię ` do draftu (onSend NIE wołany);
//   Enter bez otwartej listy woła onSend — zachowanie dotychczasowego inputu.
// - Strzałki ↑/↓ przesuwają aktywny wiersz, Escape zamyka listę, klik wybiera.
// - Zalogowany użytkownik nie widzi siebie na liście (anti self-mention).
// - Lista stoi NAD polem (czat na dole ekranu), szerokość pola — bez liczenia
//   współrzędnych karety (to nie długie pole posta, #162 nie dotyczy).
// - Mention to czysty tekst `@imię ` — bez metadanych i powiadomień (decyzja
//   z planu #168: czat nie ma push, treść niesie mention sama z siebie).
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ChatInput } from "./chat-input";

/** Mock fetch: /api/app/users zwraca członków; pozostałe endpointy puste. */
function mockFetchUsers(data: Array<{ id: string; name: string }>) {
	return vi.fn().mockImplementation((url: string) => {
		if (url.includes("/api/app/users")) {
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) });
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
	});
}

/** Rodzic trzymający stan wartości — tak jak ChatView w produkcji. */
function TestHost({ onSend, currentUserId }: { onSend?: () => void; currentUserId?: string }) {
	const [value, setValue] = useState("");
	return (
		<ChatInput
			value={value}
			onChange={setValue}
			onSend={onSend ?? (() => {})}
			currentUserId={currentUserId}
		/>
	);
}

describe("ChatInput — @mentions", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("typing @ opens the member list above the field", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchUsers([
				{ id: "u2", name: "Ania" },
				{ id: "u3", name: "Jan" },
			]),
		);
		const user = userEvent.setup();
		render(<TestHost />);

		await user.type(screen.getByLabelText("Wiadomość"), "Hej @");

		const list = await screen.findByRole("list", { name: "Wspomnij osobę" });
		expect(list.textContent).toContain("Ania");
		expect(list.textContent).toContain("Jan");
	});

	it("Enter on the open list inserts @name and does not send", async () => {
		vi.stubGlobal("fetch", mockFetchUsers([{ id: "u2", name: "Ania" }]));
		const onSend = vi.fn();
		const user = userEvent.setup();
		render(<TestHost onSend={onSend} />);

		await user.type(screen.getByLabelText("Wiadomość"), "Hej @");
		await screen.findByText("Ania");
		await user.type(screen.getByLabelText("Wiadomość"), "{Enter}");

		const input = screen.getByLabelText("Wiadomość") as HTMLInputElement;
		expect(input.value).toBe("Hej @Ania ");
		expect(onSend).not.toHaveBeenCalled();
	});

	it("Enter without the open list sends the message (dotychczasowe zachowanie)", async () => {
		vi.stubGlobal("fetch", mockFetchUsers([{ id: "u2", name: "Ania" }]));
		const onSend = vi.fn();
		const user = userEvent.setup();
		render(<TestHost onSend={onSend} />);

		await user.type(screen.getByLabelText("Wiadomość"), "Cześć{Enter}");

		expect(onSend).toHaveBeenCalledTimes(1);
	});

	it("closes the list on Escape", async () => {
		vi.stubGlobal("fetch", mockFetchUsers([{ id: "u2", name: "Ania" }]));
		const user = userEvent.setup();
		render(<TestHost />);

		await user.type(screen.getByLabelText("Wiadomość"), "Hej @");
		await screen.findByText("Ania");
		await user.type(screen.getByLabelText("Wiadomość"), "{Escape}");

		expect(screen.queryByText("Ania")).toBeNull();
	});

	it("excludes the current user from the list (anti self-mention)", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchUsers([
				{ id: "u1", name: "Tomek" },
				{ id: "u2", name: "Ania" },
			]),
		);
		const user = userEvent.setup();
		render(<TestHost currentUserId="u1" />);

		await user.type(screen.getByLabelText("Wiadomość"), "@");
		await screen.findByText("Ania");

		expect(screen.queryByText("Tomek")).toBeNull();
	});
});
