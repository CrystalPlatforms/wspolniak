// SPDX-License-Identifier: AGPL-3.0-or-later
import { filterPosts, normalizeText, type SearchablePost } from "./feed-search";

interface TestPost extends SearchablePost {
	id: string;
}

/** Posty testowe: prod-karty mają opis + autora; tytuł opcjonalny. */
function makePost(overrides: Partial<SearchablePost> & { id: string }): TestPost {
	return {
		description: null,
		author: { name: "Tomek" },
		...overrides,
	};
}

describe("filterPosts (F7 #185)", () => {
	const posts: TestPost[] = [
		makePost({ id: "p1", description: "Wakacje nad morzem", author: { name: "Tomek" } }),
		makePost({ id: "p2", description: "Urodziny babci", author: { name: "Kasia" } }),
		makePost({ id: "p3", description: "Łódź na weekend", author: { name: "Ania" } }),
	];

	it("puste zapytanie zwraca wszystkie posty bez zmian", () => {
		expect(filterPosts(posts, "")).toEqual(posts);
	});

	it("zapytanie z samych spacji zachowuje się jak puste", () => {
		expect(filterPosts(posts, "   ")).toEqual(posts);
	});

	it("filtruje po autorze, nie rozróżniając wielkości liter", () => {
		const result = filterPosts(posts, "KASI");
		expect(result.map((post) => post.id)).toEqual(["p2"]);
	});

	it("filtruje po opisie, nie rozróżniając wielkości liter", () => {
		const result = filterPosts(posts, "MORZEM");
		expect(result.map((post) => post.id)).toEqual(["p1"]);
	});

	it("filtruje po tytule, gdy post go ma", () => {
		const withTitle: TestPost[] = [
			makePost({ id: "p4", title: "Wakacje", description: null, author: { name: "Kasia" } }),
		];
		expect(filterPosts(withTitle, "wakacj").map((post) => post.id)).toEqual(["p4"]);
	});

	it("ignoruje ogonki — „lodz” znajduje „Łódź”", () => {
		const result = filterPosts(posts, "lodz");
		expect(result.map((post) => post.id)).toEqual(["p3"]);
	});

	it("gibberish daje pusty wynik", () => {
		expect(filterPosts(posts, "xyzabc")).toEqual([]);
	});

	it("zapytanie jest trimowane", () => {
		expect(filterPosts(posts, "  morzem  ").map((post) => post.id)).toEqual(["p1"]);
	});
});

describe("normalizeText", () => {
	it("obniża litery i zrzuca diakrytyki", () => {
		expect(normalizeText("ŁÓDŹ")).toBe("lodz");
	});
});
