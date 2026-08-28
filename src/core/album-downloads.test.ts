// SPDX-License-Identifier: AGPL-3.0-or-later
import { albumDownloadNames, buildAlbumVideosHtml } from "./album-downloads";

describe("albumDownloadNames — nazwy plików z tytułu albumu (#175)", () => {
	it("builds zip and html names from the album title", () => {
		expect(albumDownloadNames("Wakacje 2026")).toEqual({
			zip: "Wakacje 2026 - zdjęcia.zip",
			videosHtml: "Wakacje 2026 - wideo.html",
		});
	});

	it("strips path separators and forbidden filename characters", () => {
		const { zip } = albumDownloadNames('Ala: ma *kota*? "Kot/a\\b|c<d>e');
		expect(zip).not.toMatch(/[:*?"<>|/\\]/);
		expect(zip).toContain("Ala ma kota Kot a b c d e");
	});

	it("collapses whitespace and trims the result", () => {
		expect(albumDownloadNames("  Wakacje   nad   morzem  ").zip).toBe(
			"Wakacje nad morzem - zdjęcia.zip",
		);
	});

	it("falls back to album for an empty title", () => {
		expect(albumDownloadNames("   ").zip).toBe("album - zdjęcia.zip");
	});

	it("caps the name at 80 characters before the suffix", () => {
		const longTitle = "a".repeat(120);
		const { zip } = albumDownloadNames(longTitle);
		const base = zip.replace(" - zdjęcia.zip", "");
		expect(base.length).toBeLessThanOrEqual(80);
	});
});

describe("buildAlbumVideosHtml — plik linków wideo (#175)", () => {
	const videos = [
		{ title: "Urodziny Basi", youtubeVideoId: "abc123" },
		{ title: "Wakacje & morze", youtubeVideoId: "xyz789" },
	];

	it("renders a Polish header with the album title", () => {
		const html = buildAlbumVideosHtml("Wakacje", videos);
		expect(html).toContain('<html lang="pl">');
		expect(html).toContain("<h1>Wideo z albumu „Wakacje”</h1>");
	});

	it("renders one clickable YouTube link per video", () => {
		const html = buildAlbumVideosHtml("Wakacje", videos);
		expect(html).toContain('href="https://www.youtube.com/watch?v=abc123">Urodziny Basi</a>');
		expect(html).toContain('href="https://www.youtube.com/watch?v=xyz789">Wakacje &amp; morze</a>');
	});

	it("escapes HTML-sensitive characters in user titles", () => {
		const html = buildAlbumVideosHtml("A&B", [
			{ title: "<script>alert(1)</script>", youtubeVideoId: "q1" },
		]);
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});
});
