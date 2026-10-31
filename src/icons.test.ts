// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Strażnik zamiany ikon na Tabler (GH #230). AC z issue: brak importów ze
// starej biblioteki, wszystkie ikony z Tabler Icons. Test czyta źródła
// zamiast importować barrel @tabler/icons-react (tysiące modułów — import
// wyraźnie spowalniałby vitest), i weryfikuje nazwy względem plików ESM
// dystrybucji pakietu.

const SRC_DIR = resolve(__dirname, ".");
const TABLER_ICONS_DIR = resolve(__dirname, "../node_modules/@tabler/icons-react/dist/esm/icons");

const LUCIDE_IMPORT = /from\s+["']lucide-react["']/;
const TABLER_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']@tabler\/icons-react["']/g;
// Resztki zamiany: nazwa ikony jako widoczny tekst JSX lub jako cały string
// (codemod nadpisał kiedyś etykietę „Home" w mobile-nav na „IconHome").
const ICON_AS_JSX_TEXT = />Icon[A-Z][a-zA-Z0-9]*</;
const ICON_AS_WHOLE_STRING = /["']Icon[A-Z][a-zA-Z0-9]*["']/;

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name === "routeTree.gen.ts") continue;
		const p = resolve(dir, name);
		const s = statSync(p);
		if (s.isDirectory()) walk(p, out);
		else if (/\.(ts|tsx)$/.test(name)) out.push(p);
	}
	return out;
}

function sourceFiles(): string[] {
	return walk(SRC_DIR);
}

describe("Ikony — Tabler zamiast lucide (GH #230)", () => {
	it("w src nie pozostał żaden import z lucide-react", () => {
		const offenders = sourceFiles().filter((f) => LUCIDE_IMPORT.test(readFileSync(f, "utf8")));
		expect(offenders).toEqual([]);
	});

	it("nazwy ikon nie występują jako tekst JSX ani jako całe stringi (etykiety UI)", () => {
		const offenders = sourceFiles()
			.map((f) => {
				const content = readFileSync(f, "utf8");
				const line = content
					.split("\n")
					.findIndex((l) => ICON_AS_JSX_TEXT.test(l) || ICON_AS_WHOLE_STRING.test(l));
				return line === -1 ? null : `${f}:${line + 1}`;
			})
			.filter((f): f is string => f !== null);
		expect(offenders).toEqual([]);
	});

	it("każda ikona zaimportowana z @tabler/icons-react istnieje w pakiecie", () => {
		const used = new Set<string>();
		for (const file of sourceFiles()) {
			const content = readFileSync(file, "utf8");
			for (const m of content.matchAll(TABLER_IMPORT)) {
				for (const raw of m[1]?.split(",") ?? []) {
					const name = raw.trim().replace(/^type\s+/, "");
					if (name.startsWith("Icon")) used.add(name);
				}
			}
		}
		expect(used.size).toBeGreaterThan(50);

		const available = new Set(
			readdirSync(TABLER_ICONS_DIR)
				.filter((f) => f.endsWith(".mjs"))
				.map((f) => f.replace(/\.mjs$/, "")),
		);
		const missing = [...used].filter((name) => !available.has(name));
		expect(missing).toEqual([]);
	});
});
