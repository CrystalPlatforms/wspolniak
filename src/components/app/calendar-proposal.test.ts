// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia (reviza #245): placeholdery [data]/[opis] w nawiasach KWADRATOWYCH
// — gołe <...> jest parsowane przez MDXEditor jako JSX i pustniło w edytorze.
// Probe z prawdziwym MDXEditorem potwierdził: <data> - To <opis> → pusty edytor.
import { calendarProposalTemplate } from "./calendar-proposal";

describe("calendarProposalTemplate", () => {
	it("builds the exact proposal text with the member's name prefilled", () => {
		expect(calendarProposalTemplate("Tomek")).toBe(
			"Witam, tu Tomek\nI chciałem/ałam zaproponować nową datę do naszego Kalendarza:\n\n[data] - To [opis]",
		);
	});

	it("keeps the [data] - To [opis] placeholders for the user to fill in", () => {
		const text = calendarProposalTemplate("Ala");
		expect(text).toContain("[data] - To [opis]");
	});

	it("never uses angle brackets — MDX would swallow the whole template", () => {
		expect(calendarProposalTemplate("Ala")).not.toMatch(/<[a-z]/);
	});
});
