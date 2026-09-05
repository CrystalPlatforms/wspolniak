// SPDX-License-Identifier: AGPL-3.0-or-later
import { searchPostsForAi } from "./search-ai";

vi.mock("@/db/setup", () => ({
	getDb: vi.fn(),
}));

import { getDb } from "@/db/setup";

const mockGetDb = vi.mocked(getDb);

describe("searchPostsForAi", () => {
	const DAY = 86_400_000;
	const BASE = new Date("2026-09-01T12:00:00Z");

	/** Łańcuch select→from→leftJoin×2→where→orderBy→limit→rows. */
	function mockSearchRows(rows: unknown[]) {
		const mockLimit = vi.fn().mockResolvedValue(rows);
		const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere });
		const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
		const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);
	}

	function row(id: string, description: string, authorName: string, createdAt: Date) {
		return { id, description, authorName, createdAt, image: null };
	}

	it("rankuje po liczbie trafionych tokenów (remis: nowszy wygrywa)", async () => {
		mockSearchRows([
			row("p1", "Wakacje nad morzem", "Mama", new Date(BASE.getTime() - DAY)),
			row("p2", "Wakacje w górach", "Tata", BASE),
		]);
		const result = await searchPostsForAi("wakacje morzem", 8);
		// p1 trafia w „wakac” + „morze” (2 pkt), p2 tylko „wakac” (1 pkt).
		expect(result.map((post) => post.id)).toEqual(["p1", "p2"]);
	});

	it("najstarszy → porządkuje rosnąco po dacie, bez filtra słów", async () => {
		// wiersze celowo w losowej kolejności — sort liczy się w JS
		mockSearchRows([
			row("p2", "Środkowy", "Mama", new Date(BASE.getTime() - DAY)),
			row("p3", "Najnowszy", "Tata", BASE),
			row("p1", "Najstarszy", "Mama", new Date(BASE.getTime() - 2 * DAY)),
		]);
		const result = await searchPostsForAi("pokaż najstarszy post", 3);
		expect(result.map((post) => post.id)).toEqual(["p1", "p2", "p3"]);
	});

	it("najnowszy → porządkuje malejąco po dacie, z limitem", async () => {
		mockSearchRows([
			row("p1", "Stary", "Mama", new Date(BASE.getTime() - 2 * DAY)),
			row("p3", "Najnowszy", "Tata", BASE),
			row("p2", "Środkowy", "Mama", new Date(BASE.getTime() - DAY)),
		]);
		const result = await searchPostsForAi("pokaż najnowszy post", 2);
		expect(result.map((post) => post.id)).toEqual(["p3", "p2"]);
	});

	it("zapytanie bez tokenów i bez intencji daty → pusty wynik", async () => {
		mockSearchRows([]);
		const result = await searchPostsForAi("!!! ...", 8);
		expect(result).toEqual([]);
	});
});
