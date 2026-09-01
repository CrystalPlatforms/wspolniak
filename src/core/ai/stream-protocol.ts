// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Protokół strumienia czatu (deep module): endpoint Hono i klient czatu
 * rozmawiają liniami NDJSON — jedna linia = jeden token: treść, myślenie
 * (reasoning modeli typu Qwen) albo lista dopasowanych postów (F5 #183).
 * JSON-escape czyni protokół odpornym na nowe linie i cudzysłowy w treści tokenów.
 */

export type ChatTokenKind = "text" | "reasoning" | "posts";

export interface PostPreview {
	id: string;
	title: string;
	author: string;
	/** Data posta w formacie ISO (yyyy-mm-dd) — formatuje dopiero UI. */
	date: string;
	/** Pełny URL miniatury z Cloudflare Images; null = post bez zdjęć. */
	thumbnail: string | null;
}

export type ChatToken =
	| { kind: "text" | "reasoning"; text: string }
	| { kind: "posts"; posts: PostPreview[] }
	| { kind: "searching" };

/**
 * Token → linia NDJSON (z "\n" na końcu). Treść/myślenie pakują się w pole
 * `v`, posty w pole `posts`, szukanie to sam znacznik — klucz `k` rozróżnia
 * wszystkie rodzaje tokenów.
 */
export function encodeToken(token: ChatToken): string {
	if (token.kind === "posts") {
		return `${JSON.stringify({ k: "p", posts: token.posts })}\n`;
	}
	if (token.kind === "searching") {
		return `${JSON.stringify({ k: "s" })}\n`;
	}
	const k = token.kind === "text" ? "t" : "r";
	return `${JSON.stringify({ k, v: token.text })}\n`;
}

/**
 * Jedna zbuforowana linia → token; null dla pustych/uszkodzonych linii.
 * Tokeny postów są opcjonalne — czat bez F5 ignoruje je bezpiecznie.
 */
export function decodeTokenLine(line: string): ChatToken | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	try {
		const json = JSON.parse(trimmed) as { k?: unknown; v?: unknown; posts?: unknown };
		if (json.k === "s") {
			return { kind: "searching" };
		}
		if (json.k === "p") {
			const posts = sanitizePreviews(json.posts);
			return posts ? { kind: "posts", posts } : null;
		}
		if (json.k === "t" || json.k === "r") {
			if (typeof json.v !== "string") return null;
			return { kind: json.k === "t" ? "text" : "reasoning", text: json.v };
		}
		return null;
	} catch {
		return null; // fragment/przekłamana linia — pomijamy bez wybuchu czatu
	}
}

/** Waliduje surowy JSON listy postów; null dla czegokolwiek innego niż poprawne karty. */
function sanitizePreviews(raw: unknown): PostPreview[] | null {
	if (!Array.isArray(raw) || raw.length === 0) return null;
	const posts: PostPreview[] = [];
	for (const entry of raw) {
		if (typeof entry !== "object" || entry === null) return null;
		const candidate = entry as Partial<PostPreview>;
		if (
			typeof candidate.id !== "string" ||
			typeof candidate.title !== "string" ||
			typeof candidate.author !== "string" ||
			typeof candidate.date !== "string" ||
			(candidate.thumbnail !== null && typeof candidate.thumbnail !== "string")
		) {
			return null;
		}
		posts.push({
			id: candidate.id,
			title: candidate.title,
			author: candidate.author,
			date: candidate.date,
			thumbnail: candidate.thumbnail ?? null,
		});
	}
	return posts;
}
