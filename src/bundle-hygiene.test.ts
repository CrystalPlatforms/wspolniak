// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Higiena bundle klienta (issue #239, v9):
 * 1. Wspólniak Glass usunięty całkowicie — zero referencji w src/
 *    (moduł, CSS, receptury w komponentach, toggle w ustawieniach).
 * 2. Pliki klienta nie importują modułów, których łańcuch importów sięga
 *    drizzle-orm / @neondatabase (kod serwerowy nie trafia do przeglądarki).
 *    Stałe współdzielone z klientem żyją w wąskich plikach bez zależności DB
 *    (np. db/instance/feature-flags.ts, db/post-reactions/reaction-types.ts),
 *    a klient importuje je po głębokiej ścieżce, nie przez beczkę domeny.
 */

// Skanujemy src/ — test żyje bezpośrednio w nim (konwencja testów egzekwujących).
const SRC_ROOT = import.meta.dirname;

/** Katalogi z kodem wykonywanym w przeglądarce (DOM/jsdom) — plus stuby server-fn,
 *  które TanStack Start wysyła do klienta (top-level importy DB wyciekają z nich
 *  do bundle'a jako gołe importy side-effect). */
const CLIENT_DIRS = [
	"components",
	"routes",
	"pwa",
	"lib",
	"images",
	"chat",
	"docs",
	join("core", "functions"),
].map((dir) => join(SRC_ROOT, dir));

/** Serwerowe pliki w katalogach klienta — Durable Object i worker dla sw.js. */
const SERVER_FILE_EXCEPTIONS = [join(SRC_ROOT, "chat", "chat-room.ts")];

function walkFiles(dir: string): string[] {
	const entries = readdirSync(dir);
	const files: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			files.push(...walkFiles(full));
		} else if (/\.(ts|tsx|css|md)$/.test(entry)) {
			files.push(full);
		}
	}
	return files;
}

/** Wyciąga specyfikatory importów (statycznych i dynamicznych) z pliku źródłowego.
 *  `import type` jest pomijany — znika przy kompilacji, nie trafia do bundle'a. */
function importSpecifiers(source: string): string[] {
	const code = source.replace(/import\s+type\s[\s\S]*?from\s*["'][^"']+["'];?/g, "");
	const specifiers = new Set<string>();
	for (const match of code.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) {
		specifiers.add(match[1]);
	}
	return [...specifiers];
}

/** Rozwiązuje specyfikator na plik .ts/.tsx/index.ts względem importera. */
function resolveImport(fromFile: string, specifier: string): string | null {
	const base = specifier.startsWith("@/")
		? join(SRC_ROOT, specifier.slice(2))
		: resolve(fromFile, "..", specifier);
	for (const candidate of [
		`${base}.ts`,
		`${base}.tsx`,
		join(base, "index.ts"),
		join(base, "index.tsx"),
	]) {
		try {
			if (statSync(candidate).isFile()) return candidate;
		} catch {
			// kolejny kandydat
		}
	}
	return null;
}

/** Plik jest stubem server-fn — jego dynamiczne importy (w ciele handlera)
 *  są wycinane przez TanStack i nie trafiają do klienta. */
function isServerFnStub(file: string): boolean {
	return file.includes(`${join("core", "functions")}`);
}

/** Specyfikatory importów pliku z uwzględnieniem reguły stubów server-fn. */
function memberSpecifiers(file: string): string[] {
	let source = readFileSync(file, "utf8");
	if (isServerFnStub(file)) {
		source = source.replace(/import\(\s*["'][^"']+["']\s*\)/g, "");
	}
	return importSpecifiers(source);
}

/** Closure importów pliku (transzytywnie, tylko w obrębie src/). */
function importClosure(file: string): Set<string> {
	const seen = new Set<string>();
	const queue = [file];
	while (queue.length > 0) {
		const current = queue.pop();
		if (!current || seen.has(current)) continue;
		seen.add(current);
		for (const specifier of memberSpecifiers(current)) {
			const target = resolveImport(current, specifier);
			if (target?.startsWith(SRC_ROOT) && !seen.has(target)) queue.push(target);
		}
	}
	return seen;
}

/** Czy plik (transzytywnie) importuje kod serwerowy: drizzle-orm albo @neondatabase. */
function isDbTainted(file: string): boolean {
	for (const member of importClosure(file)) {
		const source = readFileSync(member, "utf8").replace(
			/import\s+type\s[\s\S]*?from\s*["'][^"']+["'];?/g,
			"",
		);
		if (/from ["'](drizzle-orm|@neondatabase)/.test(source)) return true;
	}
	return false;
}

describe("bundle hygiene", () => {
	test("Wspólniak Glass jest całkowicie usunięty — zero referencji w src/", () => {
		const self = import.meta.filename;
		const offenders = walkFiles(SRC_ROOT).filter((file) => {
			if (file.endsWith(self)) return false;
			try {
				return /glass/i.test(readFileSync(file, "utf8"));
			} catch {
				return false;
			}
		});
		expect(offenders).toEqual([]);
	});

	test("pliki klienta nie importują modułów z drizzle-orm/@neondatabase w łańcuchu", () => {
		const clientFiles = CLIENT_DIRS.flatMap((dir) => walkFiles(dir)).filter(
			(file) =>
				/\.(ts|tsx)$/.test(file) &&
				!/\.test\.(ts|tsx)$/.test(file) &&
				!SERVER_FILE_EXCEPTIONS.includes(file) &&
				!file.endsWith(import.meta.filename),
		);
		const offenders: string[] = [];
		for (const file of clientFiles) {
			// Stub server-fn: dynamiczne importy w ciele handlera są wycinane przez
			// TanStack — liczą się wyłącznie statyczne importy top-level.
			for (const specifier of memberSpecifiers(file)) {
				const target = resolveImport(file, specifier);
				if (target && isDbTainted(target)) {
					offenders.push(`${file} → ${specifier}`);
					break;
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	test("react-markdown importuje wyłącznie implementacja markdown-text (chunk lazy, issue #239)", () => {
		const offenders = CLIENT_DIRS.flatMap((dir) => walkFiles(dir))
			.filter(
				(file) =>
					/\.(ts|tsx)$/.test(file) &&
					!/\.test\.(ts|tsx)$/.test(file) &&
					// docs/ mają własny renderer markdown — leci w chunkach tras docs, poza feedem.
					!file.includes(`${join("components", "docs")}`) &&
					!file.endsWith(join("components", "app", "markdown-text-impl.tsx")),
			)
			.filter((file) =>
				/from ["']react-markdown|from ["']remark-(gfm|breaks)/.test(readFileSync(file, "utf8")),
			);
		expect(offenders).toEqual([]);
	});

	test("leaflet ładuje się tylko dynamicznie — nikt nie importuje statycznie chat-location-form (#239)", () => {
		const offenders = CLIENT_DIRS.flatMap((dir) => walkFiles(dir))
			.filter(
				(file) =>
					/\.(ts|tsx)$/.test(file) &&
					!/\.test\.(ts|tsx)$/.test(file) &&
					!file.endsWith(join("components", "chat", "chat-location-form.tsx")),
			)
			.filter((file) => /from ["'][^"']*chat-location-form["']/.test(readFileSync(file, "utf8")));
		expect(offenders).toEqual([]);
	});

	test("motion/react tylko w pill reakcji, burście emoji i trasie wyszukiwania (#239)", () => {
		const allowed = [
			join("components", "app", "emoji-reaction-pill.tsx"),
			join("components", "app", "emoji-burst.tsx"),
			join("routes", "app", "search.tsx"),
		];
		const offenders = CLIENT_DIRS.flatMap((dir) => walkFiles(dir))
			.filter(
				(file) =>
					/\.(ts|tsx)$/.test(file) &&
					!/\.test\.(ts|tsx)$/.test(file) &&
					!allowed.some((path) => file.endsWith(path)),
			)
			.filter((file) => /from ["']motion\/react["']/.test(readFileSync(file, "utf8")));
		expect(offenders).toEqual([]);
	});
});
