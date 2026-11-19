// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Założenia kodowane przez te testy (stan przed RED):
 * - searchAlbums(query, limit) → AlbumMatch[]:
 *   { id, title, creatorName, createdAt } — tylko metadane.
 * - Trafienia w tytule LUB twórcy albumu; kandydaci: ILIKE po title LUB
 *   nazwie twórcy, pula 1000 najnowszych; ranking (remis → nowszy).
 *   Brak tokenów → pusty wynik.
 * - Świadomie NIE testowane: prawdziwy SQL (getDb mockowane na granicy),
 *   okładki/kafelki (HITL).
 */

vi.mock("@/db/setup", () => ({
	getDb: vi.fn(),
}));

import { getDb } from "@/db/setup";
import { searchAlbums } from "./search";

const mockGetDb = vi.mocked(getDb);

describe("searchAlbums", () => {
	const DAY = 86_400_000;
	const BASE = new Date("2026-09-01T12:00:00Z");

	/** Łańcuch select→from→leftJoin→where→orderBy→rows (bez LIMIT — pełne archiwum). */
	function mockSearchRows(rows: unknown[]) {
		const mockOrderBy = vi.fn().mockResolvedValue(rows);
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
		const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);
	}

	function row(id: string, title: string, creatorName: string, createdAt: Date) {
		return { id, title, creatorName, createdAt };
	}

	it("rankuje po trafieniach w tytule lub twórcy (remis: nowszy wygrywa)", async () => {
		mockSearchRows([
			row("a1", "Wakacje nad morzem", "Mama", new Date(BASE.getTime() - DAY)),
			row("a2", "Wakacje w górach", "Tata", BASE),
		]);
		const result = await searchAlbums("wakacje morzem", 8);
		expect(result.map((album) => album.id)).toEqual(["a1", "a2"]);
	});

	it("zwraca metadane (id, tytuł, twórca, data) bez nadmiaru", async () => {
		mockSearchRows([row("a1", "Wakacje nad morzem", "Mama", BASE)]);
		const result = await searchAlbums("wakacje", 8);
		expect(result).toEqual([
			{ id: "a1", title: "Wakacje nad morzem", creatorName: "Mama", createdAt: BASE },
		]);
	});

	it("zapytanie bez tokenów → pusty wynik", async () => {
		mockSearchRows([]);
		const result = await searchAlbums("!!! ...", 8);
		expect(result).toEqual([]);
	});
});
