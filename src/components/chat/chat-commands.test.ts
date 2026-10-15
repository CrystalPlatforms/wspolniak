// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu chat-commands (#214 — Chat F1):
// - Trigger `/` działa jak trigger `@` z mentionów (#168): `/` na początku
//   lub po białym znaku, bez białego znaku między `/` a karetą.
// - `a/b` w środku słowa i `https://…` (bez spacji przed `/`) NIE triggerują.
// - F1: `/link`; F2 (#215): `/ankieta`; F3 (#216): `/polozenie`; F4 (#217):
//   `/dodaj`; F6 (#219): `/wydarzenie`. Filtr query (prefiks, case-insensitive)
//   był gotowy od F1 — nowe komendy go po prostu zapełniają.
import { CHAT_COMMANDS, detectCommandQuery, filterCommands } from "./chat-commands";

describe("detectCommandQuery", () => {
	it("detects / at the start of the input", () => {
		expect(detectCommandQuery("/", 1)).toEqual({ startIndex: 0, query: "" });
	});

	it("detects / after whitespace", () => {
		expect(detectCommandQuery("hej /", 5)).toEqual({ startIndex: 4, query: "" });
	});

	it("detects / after whitespace with the typed query", () => {
		expect(detectCommandQuery("hej /li", 7)).toEqual({ startIndex: 4, query: "li" });
	});

	it("ignores / inside a word", () => {
		expect(detectCommandQuery("a/b", 3)).toBeNull();
	});

	it("ignores / inside a URL", () => {
		expect(detectCommandQuery("https://example.com/x", 21)).toBeNull();
	});

	it("stops after whitespace in the query", () => {
		expect(detectCommandQuery("/link cos", 9)).toBeNull();
	});
});

describe("filterCommands", () => {
	it("lists all shipped commands: /link, /ankieta (#215), /polozenie (#216), /dodaj (#217), /wydarzenie (#219)", () => {
		expect(CHAT_COMMANDS).toEqual([
			{ name: "/link", description: "Wstaw link" },
			{ name: "/ankieta", description: "Utwórz ankietę" },
			{ name: "/polozenie", description: "Udostępnij lokalizację" },
			{ name: "/dodaj", description: "Załącz pliki" },
			{ name: "/wydarzenie", description: "Wstaw szablon propozycji daty" },
		]);
	});

	it("filters commands by typed prefix", () => {
		expect(filterCommands("")).toHaveLength(5);
		expect(filterCommands("li")).toEqual([{ name: "/link", description: "Wstaw link" }]);
		expect(filterCommands("an")).toEqual([{ name: "/ankieta", description: "Utwórz ankietę" }]);
		expect(filterCommands("pol")).toEqual([
			{ name: "/polozenie", description: "Udostępnij lokalizację" },
		]);
		// Prefiks niesprecyzowany co do wielkości liter (an = /ankieta).
		expect(filterCommands("AN")).toEqual([{ name: "/ankieta", description: "Utwórz ankietę" }]);
		expect(filterCommands("zzz")).toEqual([]);
	});
});
