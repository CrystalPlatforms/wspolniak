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
import { calendarProposalTemplate } from "@/components/app/calendar-proposal";
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
function TestHost({
	onSend,
	currentUserId,
	currentUserName,
	onFilesSelected,
}: {
	onSend?: () => void;
	currentUserId?: string;
	currentUserName?: string;
	onFilesSelected?: (files: File[]) => void;
}) {
	const [value, setValue] = useState("");
	return (
		<ChatInput
			value={value}
			onChange={setValue}
			onSend={onSend ?? (() => {})}
			onSendPoll={vi.fn().mockResolvedValue(undefined)}
			pollPending={false}
			onSendLocation={vi.fn().mockResolvedValue(undefined)}
			locationPending={false}
			onFilesSelected={onFilesSelected}
			currentUserName={currentUserName}
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

	it("Shift+Enter inserts a newline instead of sending (komponer = textarea)", async () => {
		const onSend = vi.fn();
		const user = userEvent.setup();
		render(<TestHost onSend={onSend} />);

		const input = screen.getByLabelText("Wiadomość") as HTMLTextAreaElement;
		await user.type(input, "pierwsza");
		await user.type(input, "{Shift>}{Enter}{/Shift}");
		await user.type(input, "druga");

		expect(onSend).not.toHaveBeenCalled();
		expect(input.value).toBe("pierwsza\ndruga");
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

describe("ChatInput — command bar (#214)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("@ button inserts @ and opens the member picker", async () => {
		vi.stubGlobal("fetch", mockFetchUsers([{ id: "u2", name: "Ania" }]));
		const user = userEvent.setup();
		render(<TestHost />);

		await user.click(screen.getByRole("button", { name: "Wstaw @" }));

		const input = screen.getByLabelText("Wiadomość") as HTMLInputElement;
		expect(input.value).toBe("@");
		const list = await screen.findByRole("list", { name: "Wspomnij osobę" });
		expect(list.textContent).toContain("Ania");
	});

	it("slash button inserts / into the input and opens the command picker", async () => {
		const user = userEvent.setup();
		render(<TestHost />);

		await user.click(screen.getByRole("button", { name: "Polecenia" }));

		const input = screen.getByLabelText("Wiadomość") as HTMLInputElement;
		expect(input.value).toBe("/");
		const picker = screen.getByRole("list", { name: "Polecenia" });
		expect(picker.textContent).toContain("/link");
	});

	it("typing / opens the same command picker; Enter picks /link and opens the link form", async () => {
		const user = userEvent.setup();
		render(<TestHost />);

		const input = screen.getByLabelText("Wiadomość");
		await user.type(input, "/li");
		// Picker widoczny po wpisaniu `/li` — ten sam co z przycisku.
		const picker = await screen.findByRole("list", { name: "Polecenia" });
		expect(picker.textContent).toContain("/link");

		await user.type(input, "{Enter}");
		// Wpisane `/li` znika z draftu, formularz /link otwarty.
		expect((input as HTMLInputElement).value).toBe("");
		expect(screen.getByRole("button", { name: "Wstaw" })).toBeTruthy();
	});

	it("Escape closes the command picker", async () => {
		const user = userEvent.setup();
		render(<TestHost />);

		await user.click(screen.getByRole("button", { name: "Polecenia" }));
		await screen.findByRole("list", { name: "Polecenia" });
		await user.type(screen.getByLabelText("Wiadomość"), "{Escape}");

		expect(screen.queryByRole("list", { name: "Polecenia" })).toBeNull();
	});

	it("saving the link form inserts the token at the caret, combined with existing text", async () => {
		const user = userEvent.setup();
		render(<TestHost />);

		const input = screen.getByLabelText("Wiadomość") as HTMLInputElement;
		await user.type(input, "Hej ");
		await user.click(screen.getByRole("button", { name: "Polecenia" }));
		// Wybór /link z pickera otwiera formularz.
		await user.click(screen.getByText("/link"));
		await screen.findByRole("button", { name: "Wstaw" });

		await user.type(screen.getByLabelText("Tytuł"), "Przepis");
		await user.type(screen.getByLabelText("Adres URL"), "https://example.com");
		await user.click(screen.getByRole("button", { name: "Wstaw" }));

		expect(input.value).toBe("Hej [Przepis](https://example.com)");
	});

	it("typing @ closes the open link form and opens the member picker", async () => {
		vi.stubGlobal("fetch", mockFetchUsers([{ id: "u2", name: "Ania" }]));
		const user = userEvent.setup();
		render(<TestHost />);

		await user.click(screen.getByRole("button", { name: "Polecenia" }));
		await user.click(screen.getByText("/link"));
		await screen.findByRole("button", { name: "Wstaw" });

		await user.type(screen.getByLabelText("Wiadomość"), "@");

		expect(screen.queryByRole("button", { name: "Wstaw" })).toBeNull();
		await screen.findByRole("list", { name: "Wspomnij osobę" });
	});

	it("@ button mid-word inserts a leading space so the picker opens", async () => {
		vi.stubGlobal("fetch", mockFetchUsers([{ id: "u2", name: "Ania" }]));
		const user = userEvent.setup();
		render(<TestHost />);

		const input = screen.getByLabelText("Wiadomość") as HTMLInputElement;
		await user.type(input, "hej");
		await user.click(screen.getByRole("button", { name: "Wstaw @" }));

		expect(input.value).toBe("hej @");
		await screen.findByRole("list", { name: "Wspomnij osobę" });
	});
});

describe("ChatInput — rozwinięcie komponera (>20 znaków)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	function actionCluster(): HTMLElement {
		return document.querySelector('div[class*="max-md:hidden"], div.flex.shrink-0') as HTMLElement;
	}

	it("under the threshold the input is compact (h-11) and actions are visible", async () => {
		const user = userEvent.setup();
		render(<TestHost />);

		const input = screen.getByLabelText("Wiadomość") as HTMLInputElement;
		await user.type(input, "Krótka wiadomość"); // 16 znaków

		expect(input.className).toContain("h-11");
		expect(input.className).not.toContain("h-32");
		expect(input.className).toContain("rounded-full");
		expect(actionCluster().className).not.toContain("max-md:hidden");
	});

	it("over 20 characters the input grows to h-32 on mobile AND desktop", async () => {
		const user = userEvent.setup();
		render(<TestHost />);

		const input = screen.getByLabelText("Wiadomość") as HTMLInputElement;
		await user.type(input, "Ta wiadomość jest zdecydowanie dłuższa"); // > 20 znaków

		expect(input.className).toContain("h-32");
		expect(input.className).not.toContain("h-11");
		expect(input.className).toContain("rounded-2xl");
	});

	it("on mobile the action bar hides when expanded, on desktop it stays (klasa max-md:hidden)", async () => {
		const user = userEvent.setup();
		render(<TestHost />);

		const input = screen.getByLabelText("Wiadomość") as HTMLInputElement;
		await user.type(input, "Ta wiadomość jest zdecydowanie dłuższa");

		// jsdom nie liczy media queries — weryfikujemy klasy warunkowe (CSS decyduje o ekranie).
		expect(actionCluster().className).toContain("max-md:hidden");

		await user.type(input, "{backspace}".repeat(20));
		expect(input.value.length).toBeLessThanOrEqual(20);
		expect(actionCluster().className).not.toContain("max-md:hidden");
	});

	it("picker popups lose their mobile offsets when the action bar is hidden", async () => {
		const user = userEvent.setup();
		render(<TestHost />);

		const input = screen.getByLabelText("Wiadomość") as HTMLInputElement;
		await user.type(input, "Ta wiadomość jest zdecydowanie dłuższa /");

		const picker = await screen.findByRole("list", { name: "Polecenia" });
		expect(picker.className).not.toContain("max-md:-left-[148px]");
	});
});

describe("ChatInput — limit 200 znaków", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("shows the limit message when the text is capped at 200 characters", async () => {
		const user = userEvent.setup();
		render(<TestHost />);

		const input = screen.getByLabelText("Wiadomość") as HTMLTextAreaElement;
		// maxLength=200 blokuje dalsze pisanie — user musi dostać wyjaśnienie.
		await user.type(input, "x".repeat(201));

		expect(input.value).toHaveLength(200);
		expect(screen.getByText("Maksymalna długość wiadomości to 200 znaków")).toBeDefined();
	});

	it("hides the limit message below the cap", async () => {
		const user = userEvent.setup();
		render(<TestHost />);

		const input = screen.getByLabelText("Wiadomość");
		await user.type(input, "x".repeat(150));

		expect(screen.queryByText("Maksymalna długość wiadomości to 200 znaków")).toBeNull();
	});
});

describe("ChatInput — spinacz i /dodaj (F4 #217)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	/** Programowy klik w ukryty input plików — jsdom nie otwiera systemowej wybierarki. */
	function spyFileInputClick() {
		return vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
	}

	it("paperclip button opens the native file picker (multi-select input)", async () => {
		const clickSpy = spyFileInputClick();
		const user = userEvent.setup();
		render(<TestHost />);

		await user.click(screen.getByRole("button", { name: "Załącz pliki" }));

		expect(clickSpy).toHaveBeenCalledTimes(1);
		const fileInput = document.querySelector('input[type="file"]');
		expect(fileInput).toBeTruthy();
		expect((fileInput as HTMLInputElement).multiple).toBe(true);
	});

	it("/dodaj from the command picker opens the same file picker", async () => {
		const clickSpy = spyFileInputClick();
		const user = userEvent.setup();
		render(<TestHost />);

		await user.click(screen.getByRole("button", { name: "Polecenia" }));
		await screen.findByRole("list", { name: "Polecenia" });
		await user.click(screen.getByText("/dodaj"));

		expect(clickSpy).toHaveBeenCalledTimes(1);
	});

	it("picked files land in onFilesSelected (walidację robi ChatView)", async () => {
		const onFilesSelected = vi.fn();
		const user = userEvent.setup();
		render(<TestHost onFilesSelected={onFilesSelected} />);

		const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
		const photo = new File(["x"], "zdjecie.jpg", { type: "image/jpeg" });
		await user.upload(fileInput, photo);

		expect(onFilesSelected).toHaveBeenCalledWith([photo]);
		// Reset value — ponowny wybór TEGO SAMEGO pliku musi działać.
		expect(fileInput.value).toBe("");
	});
});

describe("ChatInput — /wydarzenie (F6 #219)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("inserts the calendar proposal template (with the session name) at the command position", async () => {
		const user = userEvent.setup();
		render(<TestHost currentUserName="Tomek" />);

		const input = screen.getByLabelText("Wiadomość") as HTMLInputElement;
		await user.type(input, "/");
		await screen.findByRole("list", { name: "Polecenia" });
		await user.click(screen.getByText("/wydarzenie"));

		// Input jednowierszowy sanitizuje CR/LF — szablon wchodzi jako jedna linia.
		const expected = calendarProposalTemplate("Tomek").replace(/\s+/g, " ").trim().slice(0, 200);
		expect(input.value).toBe(expected);
		expect(input.value.length).toBeLessThanOrEqual(200);
		// Kareta za szablonem — user od razu dopisuje datę i opis.
		expect(input.selectionStart).toBe(expected.length);
	});

	it("trims the template to the 200-char message limit for a very long name", async () => {
		const user = userEvent.setup();
		render(<TestHost currentUserName={"B".repeat(150)} />);

		const input = screen.getByLabelText("Wiadomość") as HTMLInputElement;
		await user.type(input, "/");
		await screen.findByRole("list", { name: "Polecenia" });
		await user.click(screen.getByText("/wydarzenie"));

		expect(input.value).toHaveLength(200);
	});
});
