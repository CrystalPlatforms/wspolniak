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
