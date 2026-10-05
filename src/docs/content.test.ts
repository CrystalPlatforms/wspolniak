// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Spec treści F9 #213 — konwencje i znajdowalność nowych artykułów:
 * - Każdy artykuł działu bugs trzyma konwencję Objaw → Rozwiązanie (sekcje
 *   `## Objaw` i `## Rozwiązanie`), więc rodzina zawsze widzi ten sam schemat.
 * - AL (RAG-lite, F7 #210) znajduje nowe artykuły po ich charakterystycznych
 *   frazach — smoke searchDocs na frazach, które występują w nowych treściach
 *   ("chunked upload" w upload zdjęć, "VAPID" w push pod maską). Ranking sam w
 *   sobie jest testowany w registry.test.ts na kontrolowanych scenariuszach.
 * - NIE testujemy tu: pełnych zbiorów slugów (registry.test.ts), treści
 *   merytorycznej (HITL), zero-secrets (zero-secrets.test.ts).
 */
import { listDocs, searchDocs } from "./registry";

describe("konwencje treści F9 #213", () => {
	it("każdy artykuł bugów ma sekcje Objaw i Rozwiązanie", () => {
		const problems: string[] = [];
		for (const doc of listDocs("bugs")) {
			if (!/^## Objaw$/m.test(doc.content)) problems.push(`${doc.slug}: brak "## Objaw"`);
			if (!/^## Rozwiązanie/m.test(doc.content))
				problems.push(`${doc.slug}: brak "## Rozwiązanie"`);
		}
		expect(problems, problems.join("; ")).toEqual([]);
	});
});

describe("AL znajduje nowe artykuły (RAG-lite)", () => {
	it("wideo pod maską znajduje się po frazie chunked upload", () => {
		const slugs = searchDocs("chunked upload").map((result) => result.doc.slug);
		expect(slugs).toContain("video-pipeline");
	});

	it("push pod maską znajduje się po frazie VAPID", () => {
		const slugs = searchDocs("VAPID").map((result) => result.doc.slug);
		expect(slugs).toContain("push-under-the-hood");
	});

	it("czat 24 h znajduje się po frazie okno 24 godzin", () => {
		const slugs = searchDocs("okno 24 godzin").map((result) => result.doc.slug);
		expect(slugs).toContain("chat-messages-missing");
	});
});
