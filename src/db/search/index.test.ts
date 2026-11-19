// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Założenia kodowane przez te testy (stan przed RED):
 * - Wspólne helpery wyszukiwarki (tokenizacja + ranking) dla trzech domen
 *   (posts, comments, albums) — bez duplikowania stemowania polskich przypadków.
 * - Tokenizacja: lowercase, podział po znakach niebędących literami/cyframi
 *   (z polskimi), tokeny ≥3 znaki, docięte do prefiksu 5 znaków, max 12 unikalnych.
 * - Ranking: liczba unikalnych tokenów trafionych w polach tekstowych
 *   (grupę pól podajemy jako stringi), remisy rozstrzyga nowsza data; zwraca
 *   top `limit`, pomijając pozycje bez żadnego trafienia.
 * - Świadomie NIE testowane: prawdziwy SQL (helpery są czysto JS-owe).
 */

import { rankSearchResults, tokenizeSearchQuery } from "./index";

describe("tokenizeSearchQuery", () => {
	it("tnie na tokeny ≥3 znaki, docięte do 5, max 12 unikalnych", () => {
		const tokens = tokenizeSearchQuery("Wakacje nad morzem Bałtyckim 2026!");
		// „wakacje"→„wakac", „nad" odpada (<3), „morzem"→„morze", „bałtyckim"→„bałty",
		// „2026" zostaje (4 znaki), max 12 unikalnych.
		expect(tokens).toEqual(["wakac", "nad", "morze", "bałty", "2026"]);
	});

	it("zapytanie bez tokenów → pusta lista", () => {
		expect(tokenizeSearchQuery("!!! ...")).toEqual([]);
	});
});

describe("rankSearchResults", () => {
	interface RankRow {
		id: string;
		texts: string[];
		createdAt: Date;
	}

	it("liczy trafienia tokenów w tekstach, remis rozstrzyga nowsza data", () => {
		const rows: RankRow[] = [
			{ id: "a", texts: ["Wakacje nad morzem"], createdAt: new Date("2026-09-01T12:00:00Z") },
			{ id: "b", texts: ["Wakacje w górach"], createdAt: new Date("2026-09-02T12:00:00Z") },
		];
		const result = rankSearchResults(rows, ["wakac", "morze"], 8, (row) => row.texts);
		// „a" trafia 2× (wakac + morze), „b" tylko „wakac" — kolejność: a, b.
		expect(result.map((row) => row.id)).toEqual(["a", "b"]);
	});

	it("pomija wiersze bez trafień, respektuje limit", () => {
		const rows: RankRow[] = [
			{ id: "a", texts: ["Nic"], createdAt: new Date("2026-09-01T12:00:00Z") },
			{ id: "b", texts: ["Wakacje"], createdAt: new Date("2026-09-02T12:00:00Z") },
		];
		const result = rankSearchResults(rows, ["wakac"], 1, (row) => row.texts);
		expect(result.map((row) => row.id)).toEqual(["b"]);
	});
});
