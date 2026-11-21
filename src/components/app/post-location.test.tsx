// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu PostLocation (#242, spisane przed testami):
// - kompaktowa karta: pinezka + etykieta (gdy jest) + współrzędne (zawsze);
// - link "Otwórz w mapach" prowadzi do zewnętrznego URL Google Maps z zapisanymi
//   lat/lng (target=_blank, rel noopener) — bez osadzonej mapy w karcie;
// - bez etykiety zostają same współrzędne (5 miejsc po przecinku).
import { render, screen } from "@testing-library/react";
import { mapLinkFor, PostLocation } from "./post-location";

describe("PostLocation", () => {
	it("pokazuje etykietę i współrzędne", () => {
		render(<PostLocation location={{ lat: 52.2319, lng: 21.0067, label: "Domek babci" }} />);

		expect(screen.getByText("Domek babci")).toBeDefined();
		expect(screen.getByText("52.23190, 21.00670")).toBeDefined();
	});

	it("bez etykiety zostają same współrzędne (tytuł + podpis)", () => {
		render(<PostLocation location={{ lat: -33.9, lng: 151.2 }} />);

		// Współrzędne są i tytułem, i podpisem karty — wspólny styl z plikami.
		expect(screen.getAllByText("-33.90000, 151.20000").length).toBeGreaterThanOrEqual(1);
		expect(screen.queryByText("Domek babci")).toBeNull();
	});

	it("link do map prowadzi do Google Maps z zapisanymi współrzędnymi", () => {
		render(<PostLocation location={{ lat: 52.2319, lng: 21.0067, label: "Domek babci" }} />);

		const link = screen.getByRole("link", { name: /otwórz w mapach/i }) as HTMLAnchorElement;
		expect(link.href).toBe("https://www.google.com/maps/search/?api=1&query=52.2319,21.0067");
		expect(link.target).toBe("_blank");
		expect(link.rel).toContain("noopener");
	});

	it("mapLinkFor buduje URL z lat/lng", () => {
		expect(mapLinkFor({ lat: 1.5, lng: -2.25 })).toBe(
			"https://www.google.com/maps/search/?api=1&query=1.5,-2.25",
		);
	});
});
