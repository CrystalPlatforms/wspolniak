// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { VideoProcessingNotice } from "./video-processing-notice";

describe("VideoProcessingNotice", () => {
	it("informs that YouTube needs time to process the uploaded video", () => {
		render(<VideoProcessingNotice />);

		// Komunikat musi jasno mówić, że YouTube przetwarza wrzucone wideo.
		expect(screen.getByText(/przetworz/i)).toBeDefined();
	});

	it("tells the user processing takes 2 to 5 minutes", () => {
		render(<VideoProcessingNotice />);

		// Drugi fakt z #117: czas przetwarzania 2–5 minut.
		expect(screen.getByText(/od 2 do 5 minut/i)).toBeDefined();
	});
});
