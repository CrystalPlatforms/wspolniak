// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Założenia kodowane przez te testy (stan przed RED):
 * - searchComments(query, limit) → CommentMatch[]:
 *   { id, postId, body, authorName, createdAt } — tylko metadane, bez bajtów.
 * - Tokenizacja wspólna (@/db/search), bez intencji daty (to feature postów):
 *   trafienia w treści komentarza LUB nazwie autora.
 * - Kandydaci: nieusunięte komentarze (deletedAt null), ILIKE po body LUB
 *   nazwie autora, pula 1000 najnowszych; ranking po trafieniach (remis →
 *   nowszy). Brak tokenów → pusty wynik.
 * - Świadomie NIE testowane: prawdziwy SQL (getDb mockowane na granicy).
 */

vi.mock("@/db/setup", () => ({
	getDb: vi.fn(),
}));

import { getDb } from "@/db/setup";
import { searchComments } from "./search";

const mockGetDb = vi.mocked(getDb);

describe("searchComments", () => {
	const DAY = 86_400_000;
	const BASE = new Date("2026-09-01T12:00:00Z");

	/** Łańcuch select→from→innerJoin→where→orderBy→rows (bez LIMIT — pełne archiwum). */
	function mockSearchRows(rows: unknown[]) {
		const mockOrderBy = vi.fn().mockResolvedValue(rows);
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
		const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);
	}

	function row(id: string, postId: string, body: string, authorName: string, createdAt: Date) {
		return { id, postId, body, authorName, createdAt };
	}

	it("rankuje po trafieniach w treści lub autorze (remis: nowszy wygrywa)", async () => {
		mockSearchRows([
			row("k1", "p1", "Piękny zachód słońca", "Mama", new Date(BASE.getTime() - DAY)),
			row("k2", "p2", "Zachód w górach", "Tata", BASE),
		]);
		const result = await searchComments("zachód słońca", 8);
		// k1 trafia 2× (zacho + słońc), k2 raz — kolejność: k1, k2.
		expect(result.map((comment) => comment.id)).toEqual(["k1", "k2"]);
	});

	it("zwraca metadane (id, postId, body, autor, data) bez nadmiaru", async () => {
		mockSearchRows([row("k1", "p1", "Piękny zachód", "Mama", BASE)]);
		const result = await searchComments("zachód", 8);
		expect(result).toEqual([
			{ id: "k1", postId: "p1", body: "Piękny zachód", authorName: "Mama", createdAt: BASE },
		]);
	});

	it("zapytanie bez tokenów → pusty wynik", async () => {
		mockSearchRows([]);
		const result = await searchComments("!!! ...", 8);
		expect(result).toEqual([]);
	});
});
