// SPDX-License-Identifier: AGPL-3.0-or-later

// Pobieranie zawartości albumu (#175): plik linków wideo i nazwy plików
// pochodzące od tytułu albumu. Sam ZIP (streaming) żyje w warstwie API —
// tu zostaje to, co da się zbudować bez dostępu do sieci.

/** Wideo albumu na potrzeby pliku linków (#175). */
export interface AlbumDownloadVideo {
	title: string;
	youtubeVideoId: string;
}

/** Nazwy plików pobierania — sanityzowane z tytułu albumu. */
export interface AlbumDownloadNames {
	zip: string;
	videosHtml: string;
}

/**
 * Podstawa nazwy pliku z tytułu albumu: usuwa znaki niedozwolone w nazwach
 * plików (także `/` i `\` — separatory ścieżek) i kontrolne, zwija białe znaki,
 * ucina do 80 znaków. Pusty/znikający tytuł → „album".
 */
export function albumDownloadFileBase(albumTitle: string): string {
	const cleaned = Array.from(albumTitle)
		.map((ch) => {
			const isForbidden = '/\\:*?"<>|'.includes(ch);
			const DEL = String.fromCharCode(127);
			const isControl = ch < " " || ch === DEL;
			if (isForbidden || isControl) return " ";
			return ch;
		})
		.join("")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 80)
		.trim();
	return cleaned.length > 0 ? cleaned : "album";
}
/** Nazwy plików pobierania dla albumu o danym tytule (#175). */
export function albumDownloadNames(albumTitle: string): AlbumDownloadNames {
	const base = albumDownloadFileBase(albumTitle);
	return { zip: `${base} - zdjęcia.zip`, videosHtml: `${base} - wideo.html` };
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Treść pliku „Pobierz wideo" (#175): polski nagłówek + jeden klikalny link
 * YouTube na film. Tytuły pochodzą od użytkowników — escapowane do HTML.
 */
export function buildAlbumVideosHtml(albumTitle: string, videos: AlbumDownloadVideo[]): string {
	const items = videos
		.map(
			(video) =>
				`\t<li><a href="https://www.youtube.com/watch?v=${escapeHtml(video.youtubeVideoId)}">${escapeHtml(video.title)}</a></li>`,
		)
		.join("\n");

	return [
		"<!doctype html>",
		'<html lang="pl">',
		"<head>",
		'\t<meta charset="utf-8" />',
		`\t<title>Wideo z albumu „${escapeHtml(albumTitle)}” — Wspólniak</title>`,
		"</head>",
		"<body>",
		`\t<h1>Wideo z albumu „${escapeHtml(albumTitle)}”</h1>`,
		"\t<p>Kliknij link, aby otworzyć film na YouTube.</p>",
		"\t<ul>",
		items,
		"\t</ul>",
		"</body>",
		"</html>",
		"",
	].join("\n");
}
