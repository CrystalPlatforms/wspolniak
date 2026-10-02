// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Zero-secrets guard (F1 #204, user story 17): skan po CAŁEJ zbundlowanej treści
 * docsów — obecnym i każdej przyszłej (F8 i kolejne edycje treści wchodzą tu
 * automatycznie przez registry).
 *
 * Założenia zakodowane w testach:
 * - Straż pilnuje kształtów, nie listy znanych sekretów: kształ klucza API,
 *   bearer tokena, JWT, URL-a z danymi uwierzytelniającymi oraz typowych
 *   prefiksów dostawców (sk-, AKIA, ghp_, xox, AIza).
 * - Skan obejmuje TYTUŁ i TREŚĆ każdego dokumentu, we wszystkich działach.
 * - Prawdziwe instrukcje użytkownika (np. „wklej link z YouTube") NIE mają
 *   przechodzić — wzorce są dopasowane do realnych sekretów, nie do słów kluczowych.
 * - NIE testujemy tu: czy dokumenty istnieją (registry.test.ts), renderowania.
 */
import { DOC_DEPARTMENTS, listDocs } from "./registry";

/** Wzorce kształtów sekretów — dodawaj nowe tylko po realnym kształcie, nie po słowie. */
const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
	{ name: "OpenAI-klucz (sk-...)", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
	{ name: "AWS access key (AKIA...)", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
	{ name: "GitHub token (ghp_/gho_...)", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
	{ name: "Slack token (xox...)", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
	{ name: "Google API key (AIza...)", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
	{ name: "Bearer token", pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/i },
	{ name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
	{ name: "URL z poświadczeniami (user:pass@)", pattern: /\bhttps?:\/\/[^\s/:@]+:[^\s/:@]+@/ },
	{ name: "Stripe key (rk_/pk_ live)", pattern: /\b[rp]k_live_[A-Za-z0-9]{20,}\b/ },
];

describe("zero-secrets guard", () => {
	const allDocs = DOC_DEPARTMENTS.flatMap((department) => listDocs(department));

	it("registry ma dokumenty do przeskanowania (straż nie przechodzi pusto)", () => {
		expect(allDocs.length).toBeGreaterThan(0);
	});

	it.each(
		SECRET_PATTERNS.map((secret) => [secret.name, secret.pattern] as const),
	)("żaden dokument nie zawiera %s", (_name, pattern) => {
		const hits: string[] = [];
		for (const doc of allDocs) {
			if (pattern.test(doc.title)) hits.push(`${doc.department}/${doc.slug} (tytuł)`);
			if (pattern.test(doc.content)) hits.push(`${doc.department}/${doc.slug}`);
		}
		expect(hits, `Sekret kształtu znaleziony w:\n${hits.join("\n")}`).toEqual([]);
	});
});
