// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Protokół strumienia czatu (deep module): endpoint Hono i klient czatu
 * rozmawiają liniami NDJSON — jedna linia = jeden token, treść albo myślenie
 * (reasoning modeli typu Qwen). JSON-escape czyni protokół odpornym na
 * nowe linie i cudzysłowy w treści tokenów.
 */

export type ChatTokenKind = "text" | "reasoning";

export interface ChatToken {
	kind: ChatTokenKind;
	text: string;
}

/** Token → linia NDJSON (z "\n" na końcu) do enqueued w ReadableStream. */
export function encodeToken(token: ChatToken): string {
	const k = token.kind === "text" ? "t" : "r";
	return `${JSON.stringify({ k, v: token.text })}\n`;
}

/** Jedna zbuforowana linia → token; null dla pustych/uszkodzonych linii. */
export function decodeTokenLine(line: string): ChatToken | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	try {
		const json = JSON.parse(trimmed) as { k?: unknown; v?: unknown };
		if (json.k === "t" || json.k === "r") {
			if (typeof json.v !== "string") return null;
			return { kind: json.k === "t" ? "text" : "reasoning", text: json.v };
		}
		return null;
	} catch {
		return null; // fragment/przekłamana linia — pomijamy bez wybuchu czatu
	}
}
