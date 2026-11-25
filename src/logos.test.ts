// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// #248: wszystkie loga to WebP. Usunięte PNG-i nie mogą wrócić ani jako
// pliki, ani jako martwe odwołania w źródłach — każdy "/logos/<nazwa>" w kodzie
// musi wskazywać istniejący plik .webp w public/logos.
const LOGOS_DIR = resolve(import.meta.dirname, "../public/logos");
const SRC_DIR = resolve(import.meta.dirname, ".");

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

describe("Loga — WebP (issue #248)", () => {
	it("w public/logos nie ma już plików PNG", () => {
		const pngs = readdirSync(LOGOS_DIR)
			.filter((f) => f.toLowerCase().endsWith(".png"))
			.filter((f) => f !== ".DS_Store");
		expect(pngs).toEqual([]);
	});

	it("każde odwołanie /logos/ w src wskazuje istniejący plik .webp", () => {
		const offenders: string[] = [];
		for (const file of walk(SRC_DIR)) {
			const content = readFileSyncSafe(file);
			if (!content) continue;
			const matches = content.match(/\/logos\/[A-Za-z0-9._-]+/g) ?? [];
			for (const ref of matches) {
				const base = resolve(import.meta.dirname, "../public", ref.slice(1));
				const ok = ref.endsWith(".webp") && existsSync(base);
				if (!ok) offenders.push(`${file}: ${ref}`);
			}
		}
		expect(offenders).toEqual([]);
	});
});

function readFileSyncSafe(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}
