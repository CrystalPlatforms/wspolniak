// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu ComposerLocationDialog (#242, reviza usera: dialog zamiast sekcji):
// - Leaflet to granica systemowa — mockujemy moduł, test steruje pinezką przez
//   przechwycony onChange pickera (wzorzec chat-location-form.test.tsx);
// - bez pinezki "Zapisz lokalizację" jest zablokowany;
// - pinezka + etykieta -> onSave({lat, lng, label}); etykieta pusta -> bez klucza
//   (etykieta zawsze w szkicy, payload buduje onSave/resolve);
// - "Anuluj" domyka bez zapisu; etykieta ma twardy limit 200 znaków.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { pickerOnChange } = vi.hoisted(() => ({
	pickerOnChange: {
		current: null as ((value: { lat: number; lng: number } | null) => void) | null,
	},
}));

vi.mock("@/components/app/post-location-picker", () => ({
	default: ({
		value,
		onChange,
	}: {
		value: { lat: number; lng: number } | null;
		onChange: (value: { lat: number; lng: number } | null) => void;
	}) => {
		pickerOnChange.current = onChange;
		return (
			<button
				type="button"
				data-testid="location-picker-mock"
				onClick={() => onChange?.({ lat: 50.5, lng: 20.25 })}
			>
				{value ? `${value.lat},${value.lng}` : "brak-pinezki"}
			</button>
		);
	},
}));

import {
	ComposerLocationDialog,
	type LocationDraft,
	locationDraftError,
} from "./composer-location-section";

afterEach(() => {
	cleanup();
	pickerOnChange.current = null;
});

function renderOpen(value: LocationDraft | null = null) {
	const onOpenChange = vi.fn();
	const onSave = vi.fn();
	render(<ComposerLocationDialog open onOpenChange={onOpenChange} value={value} onSave={onSave} />);
	return { onOpenChange, onSave };
}

async function placePin() {
	const mock = await screen.findByTestId("location-picker-mock");
	// symulowany klik na mapie mockowanego pickera
	await userEvent.setup().click(mock);
}

describe("ComposerLocationDialog", () => {
	it("świeży dialog: picker mock + etykieta bez pinezki, zapis zablokowany", async () => {
		renderOpen();
		expect(await screen.findByTestId("location-picker-mock")).toBeDefined();
		expect(
			(screen.getByRole("button", { name: /zapisz lokalizację/i }) as HTMLButtonElement).disabled,
		).toBe(true);
	});

	it("pinezka + etykieta -> onSave z pełnym szkicem i domknięcie", async () => {
		const user = userEvent.setup();
		const { onSave, onOpenChange } = renderOpen();
		await placePin();
		await user.type(await screen.findByLabelText(/opis \(opcjonalnie\)/i), "Domek babci");
		await user.click(screen.getByRole("button", { name: /zapisz lokalizację/i }));

		expect(onSave).toHaveBeenCalledWith({ lat: 50.5, lng: 20.25, label: "Domek babci" });
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("edycja istniejącego szkicu: picker dostaje zapisane współrzędne", async () => {
		renderOpen({ lat: 52.0, lng: 19.0, label: "Stare" });
		const mock = await screen.findByTestId("location-picker-mock");
		expect(mock.textContent).toBe("52,19");
	});

	it("Anuluj: domyka bez zapisu", async () => {
		const user = userEvent.setup();
		const { onSave, onOpenChange } = renderOpen();
		await placePin();
		await user.click(await screen.findByRole("button", { name: /anuluj/i }));

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onSave).not.toHaveBeenCalled();
	});

	it("etykieta ma twardy limit 200 znaków", async () => {
		renderOpen();
		const label = (await screen.findByLabelText(/opis \(opcjonalnie\)/i)) as HTMLInputElement;
		expect(label.maxLength).toBe(200);
	});
});

describe("locationDraftError", () => {
	it("null dla poprawnej lokalizacji", () => {
		expect(locationDraftError({ lat: 50, lng: 20, label: "Domek" })).toBeNull();
	});

	it("komunikat dla lat poza zakresem", () => {
		expect(locationDraftError({ lat: 95, lng: 20, label: "" })).toMatch(/szerokość/i);
	});

	it("komunikat dla etykiety >200 znaków", () => {
		expect(locationDraftError({ lat: 50, lng: 20, label: "x".repeat(201) })).toMatch(/200/i);
	});
});
