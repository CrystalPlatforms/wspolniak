// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu ChatLocationForm (F3 #216):
// - Leaflet to granica systemowa (jsdom nie renderuje map) — mockujemy moduł;
//   test steruje formularzem przez zarejestrowany handler map.on("click").
// - Klik na mapie → JEDNA pinezka (drugi klik ją PRZESUWA przez setLatLng).
// - „Użyj mojej lokalizacji": zgoda → pinezka na pozycji przeglądarki;
//   odmowa → widoczny komunikat (role=alert), ręczne pinowanie nadal działa.
// - Zapis: bez pinezki przycisk zablokowany; etykieta opcjonalna (trim; pusta =
//   brak klucza label). Enter w polu = zapis, Escape = anuluj.
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mapInstance, markerInstance } = vi.hoisted(() => {
	// setView/addTo chainują w prawdziwym Leaflecie (zwracają this) — mock musi też.
	const map = {
		setView: vi.fn(() => map),
		on: vi.fn(),
		remove: vi.fn(),
		// Prefiks „Leaflet" (flaga) zdejmowany w efekcie — HITL: czysta mapa, zostaje © OSM.
		attributionControl: { setPrefix: vi.fn() },
	};
	const marker = {
		addTo: vi.fn(() => marker),
		setLatLng: vi.fn(),
	};
	return { mapInstance: map, markerInstance: marker };
});

vi.mock("leaflet", () => ({
	default: {
		map: vi.fn(() => mapInstance),
		tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
		marker: vi.fn(() => markerInstance),
		divIcon: vi.fn(() => ({})),
	},
}));

import { ChatLocationForm } from "./chat-location-form";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	delete (navigator as { geolocation?: unknown }).geolocation;
});

/** Ostatni zarejestrowany handler kliknięcia mapy (formularz rejestruje w efekcie). */
function mapClickHandler(): (event: { latlng: { lat: number; lng: number } }) => void {
	const calls = (mapInstance.on.mock.calls ?? []) as [string, unknown][];
	const click = [...calls].reverse().find(([event]) => event === "click");
	if (!click) throw new Error("map.on('click') not registered");
	return click[1] as (event: { latlng: { lat: number; lng: number } }) => void;
}

describe("ChatLocationForm UI (F3 #216)", () => {
	it("renders the map container and blocks saving until a pin is placed", () => {
		const { container } = render(<ChatLocationForm onSave={vi.fn()} onCancel={vi.fn()} />);

		expect(screen.getByText("Wskaż miejsce na mapie")).toBeDefined();
		expect(container.querySelector("[data-map-container]")).not.toBeNull();
		// HITL: bez prefixu „Leaflet" (flaga) — zostaje tylko © OpenStreetMap.
		expect(mapInstance.attributionControl.setPrefix).toHaveBeenCalledWith(false);
		const submit = screen.getByRole("button", { name: "Wyślij" }) as HTMLButtonElement;
		expect(submit.disabled).toBe(true);
	});

	it("places the pin on a map click and saves the coordinates", async () => {
		const onSave = vi.fn();
		const user = userEvent.setup();
		render(<ChatLocationForm onSave={onSave} onCancel={vi.fn()} />);

		act(() => {
			mapClickHandler()({ latlng: { lat: 52.231, lng: 21.0122 } });
		});

		expect(screen.getByText("52.23100, 21.01220")).toBeDefined();
		const submit = screen.getByRole("button", { name: "Wyślij" }) as HTMLButtonElement;
		expect(submit.disabled).toBe(false);

		await user.click(submit);
		// Bez etykiety — klucz label nie powinien wystąpić wcale.
		expect(onSave).toHaveBeenCalledWith({ lat: 52.231, lng: 21.0122 });
	});

	it("moves the SAME pin on a second click (no duplicate markers)", () => {
		render(<ChatLocationForm onSave={vi.fn()} onCancel={vi.fn()} />);

		act(() => {
			mapClickHandler()({ latlng: { lat: 52.0, lng: 19.0 } });
		});
		act(() => {
			mapClickHandler()({ latlng: { lat: 53.5, lng: 20.5 } });
		});

		expect(markerInstance.setLatLng).toHaveBeenCalledWith([53.5, 20.5]);
		expect(screen.getByText("53.50000, 20.50000")).toBeDefined();
	});

	it("uses the browser position when geolocation permission is granted", () => {
		Object.defineProperty(navigator, "geolocation", {
			value: {
				getCurrentPosition: (
					success: (position: { coords: { latitude: number; longitude: number } }) => void,
				) => {
					success({ coords: { latitude: 54.4, longitude: 18.6 } });
				},
			},
			configurable: true,
		});
		render(<ChatLocationForm onSave={vi.fn()} onCancel={vi.fn()} />);

		act(() => {
			screen.getByRole("button", { name: "Użyj mojej lokalizacji" }).click();
		});

		// Mapa skacze na pozycję (zoom ulicy) i pinezka staje w miejscu usera.
		expect(mapInstance.setView).toHaveBeenCalledWith([54.4, 18.6], 15);
		expect(screen.getByText("54.40000, 18.60000")).toBeDefined();
	});

	it("degrades gracefully on permission denial — manual pinning still works", async () => {
		const onSave = vi.fn();
		const user = userEvent.setup();
		Object.defineProperty(navigator, "geolocation", {
			value: {
				getCurrentPosition: (_success: unknown, error: (err: { code: number }) => void) => {
					error({ code: 1 }); // PERMISSION_DENIED
				},
			},
			configurable: true,
		});
		render(<ChatLocationForm onSave={onSave} onCancel={vi.fn()} />);

		act(() => {
			screen.getByRole("button", { name: "Użyj mojej lokalizacji" }).click();
		});

		expect(screen.getByRole("alert").textContent).toContain("Nie udało się pobrać lokalizacji");

		// Ręczne pinowanie po odmowie nadal działa (AC #216).
		act(() => {
			mapClickHandler()({ latlng: { lat: 50, lng: 20 } });
		});
		const submit = screen.getByRole("button", { name: "Wyślij" }) as HTMLButtonElement;
		expect(submit.disabled).toBe(false);
		await user.click(submit);
		expect(onSave).toHaveBeenCalledWith({ lat: 50, lng: 20 });
	});

	it("shows a graceful message when the browser does not support geolocation", () => {
		render(<ChatLocationForm onSave={vi.fn()} onCancel={vi.fn()} />);

		act(() => {
			screen.getByRole("button", { name: "Użyj mojej lokalizacji" }).click();
		});

		expect(screen.getByRole("alert").textContent).toContain("nie wspiera lokalizacji");
	});

	it("saves a trimmed label only when it is non-empty", async () => {
		const onSave = vi.fn();
		const user = userEvent.setup();
		render(<ChatLocationForm onSave={onSave} onCancel={vi.fn()} />);

		act(() => {
			mapClickHandler()({ latlng: { lat: 53.86, lng: 21.54 } });
		});
		await user.type(screen.getByLabelText("Opis (opcjonalnie)"), "  Domek  ");
		await user.click(screen.getByRole("button", { name: "Wyślij" }));

		expect(onSave).toHaveBeenCalledWith({ lat: 53.86, lng: 21.54, label: "Domek" });
	});

	it("saves on Enter in the label field and cancels on Escape", async () => {
		const onSave = vi.fn();
		const onCancel = vi.fn();
		const user = userEvent.setup();
		render(<ChatLocationForm onSave={onSave} onCancel={onCancel} />);

		act(() => {
			mapClickHandler()({ latlng: { lat: 53.86, lng: 21.54 } });
		});
		await user.type(screen.getByLabelText("Opis (opcjonalnie)"), "{Enter}");
		expect(onSave).toHaveBeenCalledTimes(1);

		await user.type(screen.getByLabelText("Opis (opcjonalnie)"), "{Escape}");
		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});
