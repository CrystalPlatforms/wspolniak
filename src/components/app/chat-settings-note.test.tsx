// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (F8 #159): statyczna notka o wygasaniu wiadomości (24h)
// na /app/settings — ustawia oczekiwania bez zaśmiecania nagłówka czatu.
// Komponent (nie trasa) — route files są poza test discovery, a AC wymaga testu.
import { render, screen } from "@testing-library/react";
import { ChatSettingsNote } from "./chat-settings-note";

describe("ChatSettingsNote (F8 #159)", () => {
	it("renders the 24h expiry note with the exact sentence", () => {
		render(<ChatSettingsNote />);

		expect(screen.getByText("Wiadomości na Chacie znikają po 24 godzinach.")).toBeDefined();
	});
});
