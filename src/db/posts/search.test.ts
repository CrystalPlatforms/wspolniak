// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Założenia kodowane przez te testy (stan przed RED):
 * - Przemianowanie search-ai → search po usunięciu czatu AL: ta sama logika
 *   (tokenize ≥3 znaki/prefiks 5/max 12, ILIKE opis+autor, ranking trafień,
 *   intencja daty „najstarszy/najnowszy"), nowe nazwy bez „Ai".
 * - Publiczny interface: searchPosts(query, limit) → PostMatch[]
 *   (id, description, authorName, createdAt, cfImageId).
 * - Świadomie NIE testowane: prawdziwy SQL (getDb mockowane na granicy),
 *   agregacja wielu zdjęć (pokryta starymi przypadkami — przeniesiona 1:1).
 */

vi.mock("@/db/setup", () => ({
	getDb: vi.fn(),
}));

import { getDb } from "@/db/setup";
import { searchPosts } from "./search";

const mockGetDb = vi.mocked(getDb);

/**
 * Łańcuch select→from→leftJoin×2→where→orderBy→[limit]→rows. Gdy
 * implementacja nie woła .limit (tryb keyword — pełne archiwum), łańcuch
 * kończy się na orderBy (Promise z podpiętym .limit dla trybu daty).
 * Wspólny helper obu describe — mock na granicy getDb (prawdziwy SQL nie
 * jest testowany, patrz założenia na górze pliku).
 */
function mockSearchRows(rows: unknown[]) {
	const mockLimit = vi.fn().mockResolvedValue(rows);
	const mockOrderBy = vi
		.fn()
		.mockImplementation(() => Object.assign(Promise.resolve(rows), { limit: mockLimit }));
	const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
	const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere });
	const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
	const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });
	const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
	mockGetDb.mockReturnValue({ select: mockSelect } as never);
	return { mockLimit };
}

describe("searchPosts", () => {
	const DAY = 86_400_000;
	const BASE = new Date("2026-09-01T12:00:00Z");

	function row(id: string, description: string, authorName: string, createdAt: Date) {
		return { id, description, authorName, createdAt, image: null };
	}

	it("rankuje po liczbie trafionych tokenów (remis: nowszy wygrywa)", async () => {
		const { mockLimit } = mockSearchRows([
			row("p1", "Wakacje nad morzem", "Mama", new Date(BASE.getTime() - DAY)),
			row("p2", "Wakacje w górach", "Tata", BASE),
		]);
		const result = await searchPosts("wakacje morzem", 8);
		// p1 trafia w „wakac" + „morze" (2 pkt), p2 tylko „wakac" (1 pkt).
		expect(result.map((post) => post.id)).toEqual(["p1", "p2"]);
		// Keyword search szuka po CAŁYM archiwum — bez LIMIT kandydatów.
		expect(mockLimit).not.toHaveBeenCalled();
	});

	it("najstarszy/najnowszy → SQL przycina pulę do 1000 (keyword: bez limitu)", async () => {
		const { mockLimit } = mockSearchRows([
			row("p1", "Najstarszy", "Mama", new Date(BASE.getTime() - 2 * DAY)),
			row("p3", "Najnowszy", "Tata", BASE),
		]);
		await searchPosts("pokaż najstarszy post", 3);
		// Tryb daty potrzebuje właściwego KONCA historii — pool 1000 zostaje.
		expect(mockLimit).toHaveBeenCalledWith(1000);
	});

	it("najstarszy → porządkuje rosnąco po dacie, bez filtra słów", async () => {
		// wiersze celowo w losowej kolejności — sort liczy się w JS
		mockSearchRows([
			row("p2", "Środkowy", "Mama", new Date(BASE.getTime() - DAY)),
			row("p3", "Najnowszy", "Tata", BASE),
			row("p1", "Najstarszy", "Mama", new Date(BASE.getTime() - 2 * DAY)),
		]);
		const result = await searchPosts("pokaż najstarszy post", 3);
		expect(result.map((post) => post.id)).toEqual(["p1", "p2", "p3"]);
	});

	it("najnowszy → porządkuje malejąco po dacie, z limitem", async () => {
		mockSearchRows([
			row("p1", "Stary", "Mama", new Date(BASE.getTime() - 2 * DAY)),
			row("p3", "Najnowszy", "Tata", BASE),
			row("p2", "Środkowy", "Mama", new Date(BASE.getTime() - DAY)),
		]);
		const result = await searchPosts("pokaż najnowszy post", 2);
		expect(result.map((post) => post.id)).toEqual(["p3", "p2"]);
	});

	it("zapytanie bez tokenów i bez intencji daty → pusty wynik", async () => {
		mockSearchRows([]);
		const result = await searchPosts("!!! ...", 8);
		expect(result).toEqual([]);
	});
});

/**
 * Indeks #244: search postów dopasowuje dodatkowo pytanie ankiety i etykietę
 * lokalizacji (case-insensitive, ta sama tokenizacja co opis/autor). Opcje
 * ankiety świadomie NIE są indeksowane (szum — decyzja PRD #240). Ranking
 * liczy trafienia też w pytaniu/etykiecie, bo post dopasowany WYŁĄCZNIE
 * pytaniem musiałby inaczej dostać score 0 i wypaść z wyników.
 */
describe("searchPosts — indeks ankiety i lokalizacji (#244)", () => {
	const BASE = new Date("2026-09-01T12:00:00Z");

	function rowWith(id: string, description: string, extra: { poll?: unknown; location?: unknown }) {
		return { id, description, authorName: "Mama", createdAt: BASE, image: null, ...extra };
	}

	it("znajduje post po fragmencie pytania ankiety, gdy opis nie zawiera frazy", async () => {
		mockSearchRows([
			rowWith("p1", "Wieczór rodzinny", {
				poll: { question: "Kto jedzie z nami nad morze?", options: ["Ja", "Nie ja"] },
			}),
		]);

		const result = await searchPosts("morze", 8);

		expect(result.map((post) => post.id)).toEqual(["p1"]);
	});

	it("znajduje post po fragmencie etykiety lokalizacji", async () => {
		mockSearchRows([
			rowWith("p2", "Wspólny wyjazd", {
				location: { lat: 54.4, lng: 18.6, label: "Plaża Stogi" },
			}),
		]);

		const result = await searchPosts("stogi", 8);

		expect(result.map((post) => post.id)).toEqual(["p2"]);
	});

	it("rankuje trafienia w pytaniu i etykiecie na równi z opisem (remis → nowszy)", async () => {
		mockSearchRows([
			rowWith("p-old", "Spotkanie", {
				poll: { question: "Dokąd pojedziemy?", options: ["Morze", "Góry"] },
			}),
			rowWith("p-new", "Spotkanie", {
				location: { lat: 1, lng: 2, label: "Morze" },
			}),
		]);

		const result = await searchPosts("morze spotkanie", 8);

		// Oba posty mają po 2 trafienia („spotk" + „morze") — remis rozstrzyga data.
		expect(result.map((post) => post.id)).toEqual(["p-new", "p-old"]);
	});

	it("NIE indeksuje opcji ankiety — trafienie tylko w opcję = post wypada", async () => {
		// SQL zwraca kandydata (mock na granicy getDb), ale ranking liczy wyłącznie
		// opis/autor/pytanie/etykietę — trafienie w samą opcję daje score 0.
		mockSearchRows([
			rowWith("p3", "Obiad", {
				poll: { question: "Co jemy?", options: ["Pizza", "Rosół"] },
			}),
		]);

		const result = await searchPosts("pizza", 8);

		expect(result).toEqual([]);
	});

	it("post bez ankiety i lokalizacji nadal wygrywa po opisie (regresja)", async () => {
		// Surowy wiersz jak przed #244 — bez poll/location.
		mockSearchRows([
			{
				id: "p4",
				description: "Wakacje nad morzem",
				authorName: "Tata",
				createdAt: BASE,
				image: null,
			},
		]);

		const result = await searchPosts("wakacje", 8);

		expect(result.map((post) => post.id)).toEqual(["p4"]);
	});

	it("wynik zachowuje publiczny interfejs PostMatch — bez pól indeksu #244", async () => {
		mockSearchRows([
			rowWith("p5", "Opis", {
				poll: { question: "Pytanie?", options: ["a", "b"] },
				location: { lat: 0, lng: 0, label: "Etykieta" },
			}),
		]);

		const [post] = await searchPosts("pytanie", 8);

		expect(Object.keys(post ?? {}).sort()).toEqual([
			"authorName",
			"cfImageId",
			"createdAt",
			"description",
			"id",
		]);
	});
});
