// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="vite/client" />
// Docs registry (F1 #204) — JEDYNY sposób, w jaki jakikolwiek konsument dotyka treści
// docsów: getDoc(department, slug), listDocs(department), searchDocs(query). Treść to
// pliki Markdown w repo, bundlowane w czasie builda przez Vite raw glob import
// (Workers nie mają filesystemu). Registry i treść pozostają atomowe.

export const DOC_DEPARTMENTS = ["product", "technical", "bugs"] as const;
export type DocDepartment = (typeof DOC_DEPARTMENTS)[number];

export interface Doc {
	department: DocDepartment;
	slug: string;
	title: string;
	content: string;
}

export interface DocSearchResult {
	doc: Doc;
	score: number;
}

const modules = import.meta.glob("./content/*/*.md", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

// Frontmatter tylko z tytułem (`title: ...`) — treść dokumentu jest resztą pliku.
const FRONTMATTER_RE = /^---\r?\ntitle:\s*(.+?)\r?\n---\r?\n?/;
const PATH_RE = /^\.\/content\/([a-z-]+)\/([a-z0-9-]+)\.md$/;

function isDepartment(value: string): value is DocDepartment {
	return (DOC_DEPARTMENTS as readonly string[]).includes(value);
}

function slugToTitle(slug: string): string {
	return slug
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function parseDoc(path: string, raw: string): Doc | null {
	const match = PATH_RE.exec(path);
	if (!match) return null;
	const department = match[1];
	const slug = match[2];
	if (!isDepartment(department)) return null;

	const frontmatter = FRONTMATTER_RE.exec(raw);
	const title = frontmatter?.[1]?.trim() ?? slugToTitle(slug);
	const content = raw.replace(FRONTMATTER_RE, "");
	return { department, slug, title, content };
}

/** Wszystkie zbundlowane dokumenty, posortowane po dziale i slugu (deterministycznie). */
const ALL_DOCS: Doc[] = Object.entries(modules)
	.map(([path, raw]) => parseDoc(path, raw))
	.filter((doc): doc is Doc => doc !== null)
	.sort((a, b) => a.department.localeCompare(b.department) || a.slug.localeCompare(b.slug));

export function getDoc(department: DocDepartment, slug: string): Doc | null {
	return ALL_DOCS.find((doc) => doc.department === department && doc.slug === slug) ?? null;
}

export function listDocs(department: DocDepartment): Doc[] {
	return ALL_DOCS.filter((doc) => doc.department === department);
}

/**
 * Normalizacja do szukania: małe litery + bez diakrytyków — "zdjęć" i "zdjec"
 * (zapytanie bez polskich znaków, typowe na klawiaturach) mają trafiać tak samo.
 */
function normalizeForSearch(text: string): string {
	return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Keyword/substring scoring po tytułach i treści (PL i EN). Dopasowanie w tytule
 * waży 10, w treści 1 — ranking deterministyczny (przy remisie wygrywa kolejność
 * z ALL_DOCS). Wyniki z zerowym score są pomijane. Matching po normalizacji
 * (bez diakrytyków), więc PL z ogonkami i bez trafia identycznie.
 */
export function searchDocs(query: string, limit = 5): DocSearchResult[] {
	const tokens = normalizeForSearch(query)
		.split(/\s+/)
		.filter((token) => token.length > 0);
	if (tokens.length === 0) return [];

	const results: DocSearchResult[] = [];
	for (const doc of ALL_DOCS) {
		let score = 0;
		const title = normalizeForSearch(doc.title);
		const content = normalizeForSearch(doc.content);
		for (const token of tokens) {
			if (title.includes(token)) score += 10;
			if (content.includes(token)) score += 1;
		}
		if (score > 0) results.push({ doc, score });
	}

	return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
