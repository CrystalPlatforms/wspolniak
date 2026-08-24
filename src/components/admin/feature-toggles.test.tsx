// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (F8 #159): sekcja „Funkcje" ma CZTERY przełączniki —
// Wideo, Edytor (Markdown), Biblioteka i Chat (nazwa usera: „Chat", nie „Czat").
// Przełączenie Chata wysyła onChange({ chat }) — reszta bez zmian.
// GOTCHA: brak jest-dom → asercje przez getAttribute/toBeTruthy (nie toBeInTheDocument).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeatureToggles } from "./feature-toggles";

function renderToggles(
	flags?: Parameters<typeof FeatureToggles>[0]["flags"],
	onChange: (input: { chat?: boolean }) => void = () => {},
) {
	render(<FeatureToggles flags={flags} isSaving={false} onChange={onChange} />);
}

describe("FeatureToggles (F8 #159) — czwarty przełącznik Chat", () => {
	it("renders all four feature switches including Chat", () => {
		renderToggles({ video: true, markdown: true, library: true, chat: true });

		expect(screen.getByRole("switch", { name: "Wideo" })).toBeTruthy();
		expect(screen.getByRole("switch", { name: "Edytor (Markdown)" })).toBeTruthy();
		expect(screen.getByRole("switch", { name: "Biblioteka" })).toBeTruthy();
		expect(screen.getByRole("switch", { name: "Chat" })).toBeTruthy();
	});

	it("defaults Chat to checked when flags are not loaded yet", () => {
		renderToggles(undefined);

		expect(screen.getByRole("switch", { name: "Chat" }).getAttribute("aria-checked")).toBe("true");
	});

	it("reflects chat: false as unchecked and fires onChange({ chat: true }) on toggle", async () => {
		const onChange = vi.fn();
		renderToggles({ video: true, markdown: true, library: true, chat: false }, onChange);

		const chatSwitch = screen.getByRole("switch", { name: "Chat" });
		expect(chatSwitch.getAttribute("aria-checked")).toBe("false");

		await userEvent.click(chatSwitch);
		expect(onChange).toHaveBeenCalledWith({ chat: true });
	});
});
