// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu PostLocationPicker (#242, spisane przed testami):
// - Leaflet to granica systemowa (jsdom nie renderuje map) — mockujemy moduł;
//   test steruje pickerem przez zarejestrowany handler map.on("click");
// - klik na mapie → onChange ze współrzędnymi kliknięcia (pinezka jedna, drugi
//   klik ją PRZESUWA przez setLatLng);
// - "Moja pozycja": zgoda → pinezka na pozycji GPS; ODMOWA → komunikat
//   role=alert, po czym ręczne pinowanie NADAL działa (brak error-wall);
// - mapa montuje się RAZ (pinezka startowa z value czytana przy init);
//   onChange czytany przez ref, więc rerender rodzica nie remontuje mapy.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mapInstance, markerInstance, tileLayerInstance } = vi.hoisted(() => {
	const map = {
		setView: vi.fn(() => map),
		on: vi.fn(),
		remove: vi.fn(),
		attributionControl: { setPrefix: vi.fn() },
	};
	const marker = {
		addTo: vi.fn(() => marker),
		setLatLng: vi.fn(),
	};
	const tileLayer = { addTo: vi.fn(() => tileLayer) };
	return { mapInstance: map, markerInstance: marker, tileLayerInstance: tileLayer };
});

vi.mock("leaflet", () => ({
	default: {
		map: vi.fn(() => mapInstance),
		tileLayer: vi.fn(() => tileLayerInstance),
		marker: vi.fn(() => markerInstance),
		divIcon: vi.fn(() => ({})),
	},
}));

import PostLocationPicker from "./post-location-picker";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	delete (navigator as { geolocation?: unknown }).geolocation;
});

/** Ostatni zarejestrowany handler kliknięcia mapy. */
function mapClickHandler(): (event: { latlng: { lat: number; lng: number } }) => void {
	const calls = (mapInstance.on.mock.calls ?? []) as [string, unknown][];
	const click = [...calls].reverse().find(([event]) => event === "click");
	if (!click) throw new Error("map.on('click') not registered");
	return click[1] as (event: { latlng: { lat: number; lng: number } }) => void;
}

describe("PostLocationPicker", () => {
	it("klik na mapie ustawia współrzędne w formularzu (onChange)", () => {
		const onChange = vi.fn();
		render(<PostLocationPicker value={null} onChange={onChange} />);

		const handler = mapClickHandler();
		handler({ latlng: { lat: 50.06, lng: 19.94 } });

		expect(onChange).toHaveBeenCalledWith({ lat: 50.06, lng: 19.94 });
	});

	it("drugi klik przesuwa JEDNĄ pinezkę (setLatLng, nie nowy marker)", () => {
		const onChange = vi.fn();
		render(<PostLocationPicker value={null} onChange={onChange} />);

		const handler = mapClickHandler();
		handler({ latlng: { lat: 50.06, lng: 19.94 } });
		handler({ latlng: { lat: 51.0, lng: 20.0 } });

		expect(markerInstance.setLatLng).toHaveBeenCalledWith([51.0, 20.0]);
	});

	it("przycisk GPS wypełnia pozycję z Geolocation API", async () => {
		const onChange = vi.fn();
		const user = userEvent.setup();
		(navigator as { geolocation?: unknown }).geolocation = {
			getCurrentPosition: (
				success: (position: { coords: { latitude: number; longitude: number } }) => void,
			) => {
				success({ coords: { latitude: 54.4, longitude: 18.6 } });
			},
		};

		render(<PostLocationPicker value={null} onChange={onChange} />);
		await user.click(screen.getByRole("button", { name: /moja pozycja/i }));

		await waitFor(() => {
			expect(onChange).toHaveBeenCalledWith({ lat: 54.4, lng: 18.6 });
		});
	});

	it("odmowa GPS = komunikat bez error-wall; ręczne pinowanie dalej działa", async () => {
		const onChange = vi.fn();
		const user = userEvent.setup();
		(navigator as { geolocation?: unknown }).geolocation = {
			getCurrentPosition: (_success: unknown, error: (err: unknown) => void) => {
				error(new Error("denied"));
			},
		};

		render(<PostLocationPicker value={null} onChange={onChange} />);
		await user.click(screen.getByRole("button", { name: /moja pozycja/i }));

		// komunikat (role=alert), nie ekran błędu
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toMatch(/wskaż miejsce na mapie/i);

		// a ręczne pinowanie nadal ustawia pinezkę
		act(() => {
			mapClickHandler()({ latlng: { lat: 49.0, lng: 20.0 } });
		});
		expect(onChange).toHaveBeenCalledWith({ lat: 49.0, lng: 20.0 });
	});

	it("przy edycji (value startowe) mapa centruje się i stawia pinezkę raz", () => {
		render(<PostLocationPicker value={{ lat: 52.0, lng: 19.0 }} onChange={vi.fn()} />);

		expect(mapInstance.setView).toHaveBeenCalledWith([52.0, 19.0], 15);
		expect(markerInstance.addTo).toHaveBeenCalledTimes(1);
	});

	it("pokazuje współrzędne pinezki po ustawieniu (przez stan rodzica)", () => {
		const { useState } = require("react") as typeof import("react");
		function Parent() {
			const [value, setValue] = useState<{ lat: number; lng: number } | null>(null);
			return <PostLocationPicker value={value} onChange={setValue} />;
		}
		render(<Parent />);

		act(() => {
			mapClickHandler()({ latlng: { lat: 50.12345, lng: 19.98765 } });
		});

		expect(screen.getByText("50.12345, 19.98765")).toBeDefined();
	});
});
