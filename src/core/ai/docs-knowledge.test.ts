// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Założenia zakodowane w testach (RED, F7 #210):
 * - RAG-lite dokleja do system promptu AL najwyżej TOP 3 dokumenty (limit
 *   DOCS_SEARCH_LIMIT), najlepiej punktujący w searchDocs (tytuł +10,
 *   treść +1).
 * - Próg trafności: blok wchodzi tylko, gdy najlepiej punktujący dokument ma
 *   score >= 6 — bez tego każde pytanie dostawałoby przypadkowe fragmenty.
 * - Tokeny: lowercase, bez interpunkcji, bez stopwords (także bez diakrytyków
 *   — "wspólniak"/"wspolniak" filtrują się tak samo), minimum 3 znaki.
 * - URL-e dokumentów z docsPromptHref: origin apki https://wspolniak.com
 *   daje absolutne https://docs.wspolniak.com/...; origin localhost daje
 *   ścieżki relatywne (/product/...).
 * - Fragment sekcji jest przycinany do 500 znaków; sekcja bez nagłówka (wstęp
 *   dokumentu) wypada bez wiodącego myślnika.
 * - Kuratorowana wiedza i sekcja postów zostają bez zmian; blok docsów wchodzi
 *   między nie.
 * - NIE testujemy tu: samego searchDocs (registry.test.ts), host brancha
 *   (host.test.ts), jakości odpowiedzi modelu (HITL z uruchomioną apką).
 */

import { docsKnowledgeBlock, docsNoMatchBlock } from "./docs-knowledge";
import { buildSystemPrompt } from "./knowledge";

const PROD_ORIGIN = "https://wspolniak.com";
const DEV_ORIGIN = "http://localhost:3000";

describe("docsKnowledgeBlock (RAG-lite)", () => {
	it("pytanie o funkcję (PL) zwraca blok z tytułem i absolutnym URL-em", () => {
		const block = docsKnowledgeBlock("jak dodać zdjęcie do posta?", PROD_ORIGIN);

		expect(block).toContain("## Dokumentacja Wspólniaka");
		expect(block).toContain("Dodawanie zdjęć i wideo");
		expect(block).toContain("https://docs.wspolniak.com/product/uploading-photos");
	});

	it("pytanie o funkcję (EN) też trafia w dokumenty", () => {
		const block = docsKnowledgeBlock("how to add video to a post?", PROD_ORIGIN);

		expect(block).toContain("https://docs.wspolniak.com/product/");
		expect(block.includes("Wspólniak Wideo") || block.includes("Dodawanie zdjęć i wideo")).toBe(
			true,
		);
	});

	it("zapytanie BEZ polskich znakow trafia w te same dokumenty i limity", () => {
		// Regresja z HITL (#210): "ile moge dodac zdjec do posta?" bez ogonkow
		// dalo AL pusty kontekst liczbowy i pomyslalo "20 zdjec".
		const block = docsKnowledgeBlock("ile moge dodac zdjec do posta?", PROD_ORIGIN);

		expect(block).toContain("Dodawanie zdjęć i wideo");
		expect(block).toContain("Liczba zdjęć w poście | 10");
	});

	it("fragment sekcji limitow wygrywa ze wstepem dokumentu", () => {
		const block = docsKnowledgeBlock("ile zdjęć mogę dodać do posta?", PROD_ORIGIN);

		expect(block).toContain('"Zdjęcia — limity — ');
	});

	it("pytanie niezwiązane z żadnym dokumentem zwraca pusty blok", () => {
		expect(docsKnowledgeBlock("jaka pogoda jutro w Krakowie", PROD_ORIGIN)).toBe("");
	});

	it("gromadne powitanie z nazwą apki nie dokleja dokumentów", () => {
		expect(docsKnowledgeBlock("Cześć, co to Wspólniak?", PROD_ORIGIN)).toBe("");
	});

	it("origin deweloperski (localhost) daje ścieżki relatywne", () => {
		const block = docsKnowledgeBlock("jak dodać zdjęcie do posta?", DEV_ORIGIN);

		expect(block).toContain("(/product/uploading-photos)");
		expect(block).not.toContain("https://");
	});

	it("fragment sekcji z nagłówkiem zaczyna się od nagłówka, wstęp bez myślnika", () => {
		const block = docsKnowledgeBlock("albumy pobieranie zawartości", PROD_ORIGIN);

		expect(block).toContain('"Pobieranie i przesyłanie dalej — ');
		expect(block).not.toContain(': " — '); // brak pustego nagłówka przed myślnikiem
	});
});

describe("docsNoMatchBlock (brak trafien)", () => {
	it("kaze podac link do dokumentacji i zabrania odmowy dostepu", () => {
		const block = docsNoMatchBlock(PROD_ORIGIN);

		expect(block).toContain("## Dokumentacja Wspólniaka");
		expect(block).toContain("[Dokumentacja Wspólniaka](https://docs.wspolniak.com/)");
		expect(block).toContain("NIGDY nie mów");
	});

	it("nosi pelny indeks artykulow, m.in. dzial Bledy", () => {
		const block = docsNoMatchBlock(PROD_ORIGIN);

		expect(block).toContain("Błędy:");
		expect(block).toContain(
			"[Zdjęcie przekracza dozwolony rozmiar pliku](https://docs.wspolniak.com/bugs/big-photo)",
		);
		expect(block).toContain(
			"[Feed i posty — podstawy](https://docs.wspolniak.com/product/feed-and-posts)",
		);
	});

	it("origin deweloperski linkuje na docs.localhost z portem", () => {
		expect(docsNoMatchBlock("http://localhost:3000")).toContain("http://docs.localhost:3000/");
	});
});

describe("buildSystemPrompt z dokumentacją (F7 #210)", () => {
	it("brak trafien dokleja notke o dokumentacji (zamiast pustki)", () => {
		const prompt = buildSystemPrompt([], {
			docsQuery: "jaka pogoda jutro w Krakowie",
			appOrigin: PROD_ORIGIN,
		});

		expect(prompt).toContain("## Dokumentacja Wspólniaka");
		expect(prompt).toContain("https://docs.wspolniak.com/");
		expect(prompt).toContain("Zdjęcie przekracza dozwolony rozmiar pliku"); // indeks
		expect(prompt).not.toContain("- **"); // zero fragmentow
	});

	it("dokleja blok docsów między wiedzę a sekcję postów", () => {
		const prompt = buildSystemPrompt(
			[
				{
					title: "Wakacje",
					description: "Plaża",
					author: "Mama",
					date: "2026-09-01",
				},
			],
			{
				docsQuery: "jak dodać zdjęcie do posta?",
				appOrigin: PROD_ORIGIN,
			},
		);

		expect(prompt).toContain("# Wiedza o Wspólniaku");
		expect(prompt).toContain("## Dokumentacja Wspólniaka");
		expect(prompt).toContain("https://docs.wspolniak.com/product/uploading-photos");
		expect(prompt).toContain("## Posty z feedu dostępne dla Ciebie w tej rozmowie");
		// kolejność: wiedza < docsy < posty
		const knowledgeAt = prompt.indexOf("# Wiedza o Wspólniaku");
		const docsAt = prompt.indexOf("## Dokumentacja Wspólniaka");
		const postsAt = prompt.indexOf("## Posty z feedu dostępne");
		expect(knowledgeAt).toBeLessThan(docsAt);
		expect(docsAt).toBeLessThan(postsAt);
	});

	it("bez docsQuery prompt jest jak dawniej (bez bloku docsów)", () => {
		const prompt = buildSystemPrompt([]);

		expect(prompt).not.toContain("Dokumentacja Wspólniaka");
		expect(prompt).toContain("# Wiedza o Wspólniaku");
	});

	it("gałąź searchLimited nie dokleja docsów", () => {
		const prompt = buildSystemPrompt([], { searchLimited: true });

		expect(prompt).toContain("limit szukania jest na razie wykorzystany");
		expect(prompt).not.toContain("Dokumentacja Wspólniaka");
	});
});
