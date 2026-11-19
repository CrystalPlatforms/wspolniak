// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Wspólne helpery wyszukiwarki dla trzech domen (posts, comments, albums).
 * Bez tabel — czysta logika JS: tokenizacja zapytania i ranking trafień.
 */

/**
 * Tokeny zapytania: lowercase, podział po znakach niebędących literami/cyframi
 * (z polskimi znakami), ≥3 znaki, docięte do prefiksu 5 znaków („wakacjach" →
 * „wakac"), max 12 unikalnych — stemowanie naiwne, żeby odmienione polskie
 * przypadki trafiały w formy bazowe (i odwrotnie).
 */
export function tokenizeSearchQuery(query: string): string[] {
	return [
		...new Set(
			query
				.toLowerCase()
				.split(/[^a-ząćęłńóśźż0-9]+/)
				.filter((token) => token.length >= 3)
				.map((token) => (token.length > 5 ? token.slice(0, 5) : token))
				.slice(0, 12),
		),
	];
}

/**
 * Ranking wyników: liczba unikalnych tokenów trafionych w podane teksty
 * (case-insensitive), remisy rozstrzyga nowsza data; zwraca top `limit`,
 * pomijając pozycje bez żadnego trafienia.
 */
export function rankSearchResults<T extends { id: string; createdAt: Date }>(
	rows: T[],
	tokens: string[],
	limit: number,
	textsOf: (row: T) => string[],
): T[] {
	if (limit <= 0) return [];
	const scored = rows.map((row) => {
		const haystacks = textsOf(row).map((text) => text.toLowerCase());
		const score = tokens.reduce(
			(total, token) => total + (haystacks.some((text) => text.includes(token)) ? 1 : 0),
			0,
		);
		return { row, score };
	});
	return scored
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score || b.row.createdAt.getTime() - a.row.createdAt.getTime())
		.slice(0, limit)
		.map((entry) => entry.row);
}
