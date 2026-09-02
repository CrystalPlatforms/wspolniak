// SPDX-License-Identifier: AGPL-3.0-or-later

/** Minimalny kształt eksponowanego posta (spełnia PostCardPost).
 *  Tytuł jest opcjonalny: posty w Wspólniaku mają tylko opis + autora. */
export interface SearchablePost {
	title?: string;
	description: string | null;
	author: { name: string };
}

/** Normalizacja zapytania: małe litery + bez ogonków (NFD zrzuca diakrytyki;
 *  „ł" nie ma dekompozycji NFD — kreska jest częścią litery, dlatego osobno). */
export function normalizeText(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replaceAll("ł", "l");
}

/**
 * Live-filtrowanie feedu (F7 #185): substring po tytule (jeśli jest), opisie LUB
 * autorze, case-insensitive i bez ogonków. Puste zapytanie zwraca wejście bez
 * zmian — filtrujemy wyłącznie posty już załadowane (rodzinna skala, PRD #178).
 */
export function filterPosts<T extends SearchablePost>(posts: T[], query: string): T[] {
	const q = normalizeText(query.trim());
	if (!q) return posts;

	return posts.filter(
		(post) =>
			normalizeText(post.title ?? "").includes(q) ||
			normalizeText(post.description ?? "").includes(q) ||
			normalizeText(post.author.name).includes(q),
	);
}
