// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Założenia zakodowane w testach (F1 #204, zaktualizowane F8 #211):
 * - Registry to JEDYNY dostęp do treści docsów: Markdown z katalogu content
 *   (src/docs/content/{department}/{slug}.md) jest bundlowany w buildzie (Vite
 *   raw glob), więc testy czytają REALNE pliki — to jednocześnie pilnuje,
 *   żeby authored content pozostał sparsowalny.
 * - Frontmatter zawiera wyłącznie `title:`, treść dokumentu jest resztą pliku.
 * - Nieznany slug → null; nieznany dział → typodowo niemożliwy (union DocDepartment).
 * - searchDocs: tokeny z zapytania punktują +10 w tytule, +1 w treści;
 *   dokumenty bez trafienia nie wchodzą do wyników; sortowanie malejące po
 *   score jest deterministyczne (przy remisie wygrywa kolejność dział/slug).
 * - NIE testujemy tu: renderowania Markdown (testy markdown.tsx), host brancha
 *   (host.test.ts), treści merytorycznej dokumentów (HITL).
 */

import { DOC_DEPARTMENTS, getDoc, listDocs, searchDocs } from "./registry";

describe("docs registry", () => {
	describe("getDoc", () => {
		it("rozwiązuje znany slug produktowy z tytułem i treścią bez frontmattera", () => {
			const doc = getDoc("product", "feed-and-posts");

			expect(doc).not.toBeNull();
			expect(doc?.department).toBe("product");
			expect(doc?.slug).toBe("feed-and-posts");
			expect(doc?.title).toBe("Feed i posty — podstawy");
			expect(doc?.content).toContain("Przeglądanie feedu");
			expect(doc?.content).not.toContain("title:");
			expect(doc?.content).not.toContain("---");
		});

		it("rozwiązuje dokument techniczny (F3) z blokami kodu", () => {
			const doc = getDoc("technical", "stack");

			expect(doc).not.toBeNull();
			expect(doc?.department).toBe("technical");
			expect(doc?.content).toContain("```");
		});

		it("zwraca null dla nieznanego sluga", () => {
			expect(getDoc("product", "nie-ma-takiego")).toBeNull();
			expect(getDoc("technical", "nie-ma-takiego")).toBeNull();
		});
	});

	describe("listDocs", () => {
		it("zwraca wszystkie zbundlowane dokumenty produktowe (F8 #211)", () => {
			const slugs = listDocs("product").map((doc) => doc.slug);

			expect(slugs).toEqual([
				"al-assistant",
				"albums",
				"calendar",
				"family-chat",
				"feed-and-posts",
				"for-admins",
				"library",
				"logging-in",
				"notifications-and-pwa",
				"reactions-comments",
				"uploading-photos",
				"videos",
			]);
		});

		it("zwraca dokumenty techniczne posortowane po slugu", () => {
			expect(listDocs("technical").map((doc) => doc.slug)).toEqual([
				"architecture",
				"deploy-and-migrations",
				"stack",
			]);
		});

		it("dział bugs ma zmigrowany artykuł o za dużym zdjęciu (F4 #207)", () => {
			expect(listDocs("bugs").map((doc) => doc.slug)).toContain("big-photo");
		});

		it("ma dokument w każdym dziale (spójność registry)", () => {
			for (const department of DOC_DEPARTMENTS) {
				expect(listDocs(department).length).toBeGreaterThan(0);
			}
		});
	});

	describe("searchDocs", () => {
		it("trafienie w tytule wygrywa z trafieniem w treści", () => {
			const results = searchDocs("wideo");

			// Tytułowe trafienia (10) wygrywają z treściowymi: uploading-photos
			// i videos mają „wideo" w tytule (remis — kolejność z ALL_DOCS),
			// pozostałe dokumenty mają „wideo" tylko w treści.
			const resultsSlugs = results.map((result) => result.doc.slug);
			expect(resultsSlugs.slice(0, 2)).toEqual(["uploading-photos", "videos"]);
			for (const result of results.slice(2)) {
				expect(result.score).toBeLessThan(10);
			}
		});

		it("kilkuczłonowe zapytanie sumuje score z tytułu i treści", () => {
			const results = searchDocs("feed posty");

			expect(results[0]?.doc.slug).toBe("feed-and-posts");
			expect(results[0]?.score).toBeGreaterThan(10);
		});

		it("zapytanie niepasujące do niczego zwraca pustą listę", () => {
			expect(searchDocs("ksylometazolina")).toEqual([]);
		});

		it("puste zapytanie zwraca pustą listę", () => {
			expect(searchDocs("")).toEqual([]);
			expect(searchDocs("   ")).toEqual([]);
		});
	});
});
