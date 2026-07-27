// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { YouTubePlayer } from "./youtube-player";

describe("YouTubePlayer", () => {
	it("embeds the YouTube iframe for the given video id", () => {
		render(<YouTubePlayer youtubeVideoId="abc123" title="Wakacje" />);

		const iframe = screen.getByTitle("Wakacje");
		expect(iframe.getAttribute("src")).toBe("https://www.youtube.com/embed/abc123");
		expect(iframe.hasAttribute("allowfullscreen")).toBe(true);
	});

	it("falls back to a generic title when none is provided", () => {
		render(<YouTubePlayer youtubeVideoId="xyz" />);

		// getByTitle rzuca, gdy elementu brak — wystarczy by potwierdzić fallback.
		expect(screen.getByTitle("Wideo").getAttribute("src")).toBe(
			"https://www.youtube.com/embed/xyz",
		);
	});
});
