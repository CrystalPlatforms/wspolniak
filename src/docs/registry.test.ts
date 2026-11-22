// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Założenia zakodowane w testach (F1 #204, zaktualizowane F8 #211):
 * - Registry to JEDYNY dostęp do treści docsów: Markdown z katalogu content
 *   (src/docs/content/{department}/{slug}.md) jest bundlowany w buildzie (Vite
 *   raw glob), więc testy czytają REALNE pliki — to jednocześnie pilnuje,
 *   żeby authored content pozostał sparsowalny.
 * - Frontmatter zawiera wyłącznie `title:`, treść dokumentu jest resztą pliku.
 * - Nieznany slug → null; nieznany dział → typodowo niemożliwy (union DocDepartment).
 * - NIE testujemy tu: renderowania Markdown (testy markdown.tsx), host brancha
 *   (host.test.ts), treści merytorycznej dokumentów (HITL).
 */

import { DOC_DEPARTMENTS, getDoc, listDocs } from "./registry";

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
				"albums",
				"calendar",
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

		it("zwraca dokumenty techniczne posortowane po slugu (F9 #213 — pełne pokrycie platformy)", () => {
			expect(listDocs("technical").map((doc) => doc.slug)).toEqual([
				"architecture",
				"database-and-domains",
				"deploy-and-migrations",
				"docs-under-the-hood",
				"limits-and-performance",
				"photo-upload-pipeline",
				"push-under-the-hood",
				"pwa-offline",
				"security-and-privacy",
				"stack",
				"testing-strategy",
				"video-pipeline",
			]);
		});

		it("dział bugs ma pełny zestaw artykułów (F9 #213, big-photo z F4 #207)", () => {
			expect(listDocs("bugs").map((doc) => doc.slug)).toEqual([
				"big-photo",
				"magic-link-not-arriving",
				"push-notifications-missing",
				"slow-upload",
				"stale-content-cache",
				"youtube-video-problems",
			]);
		});

		it("ma dokument w każdym dziale (spójność registry)", () => {
			for (const department of DOC_DEPARTMENTS) {
				expect(listDocs(department).length).toBeGreaterThan(0);
			}
		});
	});
});
