// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (F7 #176): sekcja „Funkcje" ma PIĘĆ przełączników —
// Wideo, Edytor (Markdown), Biblioteka, Chat i Albumy. Przełączenie wysyła
// onChange({ klucz: wartość }) — tylko zmieniana flaga, bez reszty.
// GOTCHA: brak jest-dom → asercje przez getAttribute/toBeTruthy.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeatureToggles } from "./feature-toggles";

function renderToggles(
	flags?: Parameters<typeof FeatureToggles>[0]["flags"],
	onChange: (input: { albums?: boolean }) => void = () => {},
) {
	render(<FeatureToggles flags={flags} isSaving={false} onChange={onChange} />);
}

describe("FeatureToggles — piąty przełącznik Albumy (F7 #176)", () => {
	it("renders all five feature switches including Albumy", () => {
		renderToggles({ video: true, markdown: true, library: true, chat: true, albums: true });

		for (const label of ["Wideo", "Edytor (Markdown)", "Biblioteka", "Chat", "Albumy"]) {
			expect(screen.getByRole("switch", { name: label })).toBeTruthy();
		}
	});

	it("defaults Albumy to checked when flags are not loaded yet", () => {
		renderToggles(undefined);

		expect(screen.getByRole("switch", { name: "Albumy" }).getAttribute("aria-checked")).toBe(
			"true",
		);
	});

	it("reflects albums: false as unchecked and fires onChange({ albums: true }) on toggle", async () => {
		const onChange = vi.fn();
		renderToggles(
			{ video: true, markdown: true, library: true, chat: true, albums: false },
			onChange,
		);

		const albumsSwitch = screen.getByRole("switch", { name: "Albumy" });
		expect(albumsSwitch.getAttribute("aria-checked")).toBe("false");

		await userEvent.click(albumsSwitch);
		expect(onChange).toHaveBeenCalledWith({ albums: true });
	});
});
