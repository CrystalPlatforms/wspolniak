// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Spec treści F9 #213 — konwencje artykułów:
 * - Każdy artykuł działu bugs trzyma konwencję Objaw → Rozwiązanie (sekcje
 *   `## Objaw` i `## Rozwiązanie`), więc rodzina zawsze widzi ten sam schemat.
 * - NIE testujemy tu: pełnych zbiorów slugów (registry.test.ts), treści
 *   merytorycznej (HITL), zero-secrets (zero-secrets.test.ts).
 */
import { listDocs } from "./registry";

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
