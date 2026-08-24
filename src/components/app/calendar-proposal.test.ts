// SPDX-License-Identifier: AGPL-3.0-or-later
import { calendarProposalTemplate } from "./calendar-proposal";

describe("calendarProposalTemplate", () => {
	it("builds the exact proposal text with the member's name prefilled", () => {
		expect(calendarProposalTemplate("Tomek")).toBe(
			"Witam, tu Tomek\nI chciałem/ałam zaproponować nową datę do naszego Kalendarza:\n\n<data> - To <opis>",
		);
	});

	it("keeps the <data> - To <opis> placeholders for the user to fill in", () => {
		const text = calendarProposalTemplate("Ala");
		expect(text).toContain("<data> - To <opis>");
	});
});
