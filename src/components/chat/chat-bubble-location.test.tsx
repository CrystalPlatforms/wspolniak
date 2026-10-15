// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu ChatBubbleLocation (F3 #216):
// - Kompaktowa karta: pinezka + etykieta (jeśli jest) + współrzędne + zewnętrzny
//   link „Otwórz w mapach" z poprawnym href (uniwersalny URL Google Maps).
// - Świadomie bez interaktywnej mapy w bąbelku (odrzucone w PRD).
// - Uszkodzony payload → fallback na zwykły tekst bąbelka.
import { cleanup, render, screen } from "@testing-library/react";
import { ChatBubbleLocation, mapLinkFor } from "./chat-bubble-location";
import type { ChatMessageItem } from "./chat-view";

function locationMessage(overrides: Partial<ChatMessageItem> = {}): ChatMessageItem {
	return {
		id: "m-loc",
		authorId: "u2",
		text: "Domek na Mazurach",
		kind: "location",
		payload: { lat: 53.86111, lng: 21.54333, label: "Domek na Mazurach" },
		replyToId: null,
		replyText: null,
		createdAt: "2026-08-22T10:00:00.000Z",
		expiresAt: "2026-08-23T10:00:00.000Z",
		author: { id: "u2", name: "Kasia" },
		...overrides,
	};
}

afterEach(() => {
	cleanup();
});

describe("ChatBubbleLocation (F3 #216)", () => {
	it("renders the pin, label, coordinates and the external maps link with a correct href", () => {
		render(<ChatBubbleLocation message={locationMessage()} own={false} />);

		expect(screen.getByText("Domek na Mazurach")).toBeDefined();
		expect(screen.getByText("53.86111, 21.54333")).toBeDefined();
		const link = screen.getByRole("link", { name: "Otwórz w mapach" });
		expect(link.getAttribute("href")).toBe(mapLinkFor({ lat: 53.86111, lng: 21.54333 }));
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toContain("noopener");
	});

	it("shows coordinates only when there is no label", () => {
		render(
			<ChatBubbleLocation
				message={locationMessage({ payload: { lat: 52.23, lng: 21.01 } })}
				own={false}
			/>,
		);

		expect(screen.getByText("52.23000, 21.01000")).toBeDefined();
		expect(screen.queryByText("Domek na Mazurach")).toBeNull();
	});

	it("falls back to plain text when the payload is malformed", () => {
		render(
			<ChatBubbleLocation
				message={locationMessage({ payload: { lat: "nieskończoność" } as unknown })}
				own={false}
			/>,
		);

		// Fallback: tekst wiadomości (etykieta), bez karty i bez linku.
		expect(screen.getByText("Domek na Mazurach")).toBeDefined();
		expect(screen.queryByRole("link", { name: "Otwórz w mapach" })).toBeNull();
	});
});

describe("mapLinkFor (F3 #216)", () => {
	it("builds a universal Google Maps URL with the coordinates in the query", () => {
		expect(mapLinkFor({ lat: 52.23, lng: 21.01 })).toBe(
			"https://www.google.com/maps/search/?api=1&query=52.23,21.01",
		);
	});
});
