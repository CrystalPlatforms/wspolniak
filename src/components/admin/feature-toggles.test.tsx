// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (F7 #176 → Video v2 #194): sekcja „Funkcje" ma CZTERY
// przełączniki — Edytor (Markdown), Biblioteka, Chat i Albumy. Wideo nie ma
// przełącznika od #194 (zawsze włączone). Przełączenie wysyła
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

describe("FeatureToggles — Video v2 (#194): bez przełącznika Wideo", () => {
	it("renders no Wideo switch (video is always on after #194)", () => {
		renderToggles({
			markdown: true,
			library: true,
			chat: true,
			albums: true,
			ai: false,
		});

		expect(screen.queryByRole("switch", { name: "Wideo" })).toBeNull();
	});

	it("renders all four feature switches", () => {
		renderToggles({
			markdown: true,
			library: true,
			chat: true,
			albums: true,
			ai: false,
		});

		for (const label of ["Edytor (Markdown)", "Biblioteka", "Chat", "Albumy"]) {
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
			{ markdown: true, library: true, chat: true, albums: false, ai: false },
			onChange,
		);

		const albumsSwitch = screen.getByRole("switch", { name: "Albumy" });
		expect(albumsSwitch.getAttribute("aria-checked")).toBe("false");

		await userEvent.click(albumsSwitch);
		expect(onChange).toHaveBeenCalledWith({ albums: true });
	});
});
