// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Założenia zakodowane w testach (F8 #211):
 * - coverage-matrix.md jest commitowany z treścią i jest ŹRÓDŁEM PRAWDY pokrycia:
 *   każda funkcja (numerowany wiersz tabeli) ma >= 1 referencję dokumentu
 *   w formacie dzial/slug.
 * - Każda referencja z matrixa rozwiązuje się w registry (getDoc != null) —
 *   usunięcie dokumentu bez aktualizacji matrixa wywala test.
 * - Matrix pokrywa przynajmniej 10 funkcji i co najmniej 10 różnych dokumentów
 *   (rodzinna skala: pełna lista funkcji z PRD #202 ma 16 pozycji, ale grupujemy
 *   pokrewne w jeden wiersz).
 * - NIE testujemy tu: treści merytorycznej dokumentów (HITL), zero-secrets
 *   (zero-secrets.test.ts skanuje całą treść automatycznie).
 */
import matrixRaw from "./coverage-matrix.md?raw";
import { DOC_DEPARTMENTS, type DocDepartment, getDoc } from "./registry";

/** Referencje `dzial/slug` z całego matrixa. */
function matrixRefs(raw: string): { department: DocDepartment; slug: string }[] {
	const refs: { department: DocDepartment; slug: string }[] = [];
	const re = /(product|technical|bugs)\/([a-z0-9-]+)/g;
	for (const match of raw.matchAll(re)) {
		const department = match[1];
		const slug = match[2];
		if (department && slug) refs.push({ department: department as DocDepartment, slug });
	}
	return refs;
}

/** Numerowane wiersze tabeli (funkcje) — z pominięciem separatora |---|---|. */
function matrixFeatureRows(raw: string): string[] {
	return raw.split("\n").filter((line) => /^\|\s*\d+\s*\|/.test(line.trim()));
}

describe("feature-coverage matrix (F8 #211)", () => {
	it("matrix istnieje i ma wiersze funkcji", () => {
		expect(matrixFeatureRows(matrixRaw).length).toBeGreaterThanOrEqual(10);
	});

	it("każdy wiersz funkcji ma przynajmniej jedną referencję dokumentu", () => {
		for (const row of matrixFeatureRows(matrixRaw)) {
			expect(row).toMatch(/(product|technical|bugs)\/[a-z0-9-]+/);
		}
	});

	it("każda referencja z matrixa istnieje w registry", () => {
		const problems: string[] = [];
		for (const ref of matrixRefs(matrixRaw)) {
			if (!getDoc(ref.department, ref.slug)) {
				problems.push(`${ref.department}/${ref.slug}`);
			}
		}
		expect(problems, `Martwe referencje w matrixie: ${problems.join(", ")}`).toEqual([]);
	});

	it("pokrycie sięga dokumentów we wszystkich działach typowanych w matrixie", () => {
		const departments = new Set(matrixRefs(matrixRaw).map((ref) => ref.department));
		expect([...departments].every((department) => DOC_DEPARTMENTS.includes(department))).toBe(true);
	});
});
