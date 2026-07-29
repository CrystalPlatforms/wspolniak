// SPDX-License-Identifier: AGPL-3.0-or-later

/** Akcje formatowania obsługiwane przez toolbar (inline + blokowe + link). */
export type MarkdownAction =
	| "bold"
	| "italic"
	| "strikethrough"
	| "h2"
	| "h3"
	| "bullet"
	| "ordered"
	| "link";

/** Akcje inline — otaczają zaznaczenie znacznikiem z obu stron. */
type InlineAction = "bold" | "italic" | "strikethrough";

/** Stan edytora: tekst + bieżące zaznaczenie (kursor, gdy start === end). */
export interface EditorSelection {
	value: string;
	selectionStart: number;
	selectionEnd: number;
}

/** Znaczniki Markdown otaczające zaznaczenie z obu stron dla danej akcji inline. */
const MARKERS: Record<InlineAction, string> = {
	bold: "**",
	italic: "*",
	strikethrough: "~~",
};

/**
 * Czysty (bez DOM) deep module: transformuje stan edytora + akcję w nowy stan.
 *
 * Inline toggle (B/I/S): otacza zaznaczenie znacznikami (wrap), wstawia puste
 * znaczniki przy kursorze gdy brak zaznaczenia (insert), zdejmuje znaczniki gdy
 * tekst jest już nimi otoczony (unwrap). Akcje blokowe (H2/H3/listy) prefixują
 * każdą zaznaczoną linię i togglują prefix gdy już tam jest. Link otacza
 * zaznaczenie `[...](https://)` i zaznacza placeholder URL. Cała logika selekcji
 * DOM żyje w komponencie.
 */
export function applyMarkdown(state: EditorSelection, action: MarkdownAction): EditorSelection {
	if (action === "bold" || action === "italic" || action === "strikethrough") {
		return applyInline(state, action);
	}
	switch (action) {
		case "h2":
			return applyHeading(state, "## ");
		case "h3":
			return applyHeading(state, "### ");
		case "bullet":
			return applyLinePrefix(state, {
				makePrefix: () => "- ",
				hasPrefix: (line) => line.startsWith("- "),
				stripPrefix: (line) => line.slice(2),
			});
		case "ordered":
			return applyLinePrefix(state, {
				makePrefix: (i) => `${i + 1}. `,
				hasPrefix: (line) => ORDERED_PREFIX.test(line),
				stripPrefix: (line) => line.replace(ORDERED_PREFIX, ""),
			});
		case "link":
			return applyLink(state);
	}
}

/** Rozpoznaje już istniejący prefix listy numerowanej (`1. `, `23. ` …). */
const ORDERED_PREFIX = /^\d+\. /;
/** Placeholder URL wstawiany przez akcję link — zastępowany przez użytkownika. */
const LINK_PLACEHOLDER = "https://";

/** Toggle inline: wrap / insert / unwrap znaczników z obu stron zaznaczenia. */
function applyInline(state: EditorSelection, action: InlineAction): EditorSelection {
	const marker = MARKERS[action];
	const { value, selectionStart, selectionEnd } = state;
	const selected = value.slice(selectionStart, selectionEnd);

	// unwrap: zaznaczenie już otoczone znacznikiem z obu stron → zdejmij je (toggle off)
	if (
		selected.length >= marker.length * 2 &&
		selected.startsWith(marker) &&
		selected.endsWith(marker)
	) {
		const inner = selected.slice(marker.length, selected.length - marker.length);
		return {
			value: value.slice(0, selectionStart) + inner + value.slice(selectionEnd),
			selectionStart,
			selectionEnd: selectionStart + inner.length,
		};
	}

	// wrap (a przy pustym zaznaczeniu — insert pustych znaczników z kursorem w środku)
	const newValue =
		value.slice(0, selectionStart) + marker + selected + marker + value.slice(selectionEnd);
	return {
		value: newValue,
		selectionStart: selectionStart + marker.length,
		selectionEnd: selectionEnd + marker.length,
	};
}

/** Nagłówek: prefixuj linię stałym znacznikiem (`## ` / `### `), toggluj. */
function applyHeading(state: EditorSelection, prefix: string): EditorSelection {
	return applyLinePrefix(state, {
		makePrefix: () => prefix,
		hasPrefix: (line) => line.startsWith(prefix),
		stripPrefix: (line) => line.slice(prefix.length),
	});
}

interface PrefixSpec {
	/** Prefix do dodania przed i-tą linią (stały dla nagłówków/wypunktowań, `1. 2. …` dla list numerowanych). */
	makePrefix: (lineIndex: number) => string;
	/** Czy linia ma już ten prefix (decyduje o kierunku toggle). */
	hasPrefix: (line: string) => boolean;
	/** Zdejmij prefix z linii (toggle off). */
	stripPrefix: (line: string) => string;
}

/**
 * Akcja blokowa na liniach przeciętych przez zaznaczenie: jeśli wszystkie linie
 * mają już prefix → zdejmij go ze wszystkich (toggle off); inaczej dodaj do każdej.
 * Wynikowa selekcja obejmuje cały przekształcony blok.
 */
function applyLinePrefix(state: EditorSelection, spec: PrefixSpec): EditorSelection {
	const { value, selectionStart, selectionEnd } = state;
	const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
	const newlineAfter = value.indexOf("\n", selectionEnd);
	const lineEnd = newlineAfter === -1 ? value.length : newlineAfter;

	const block = value.slice(lineStart, lineEnd);
	const lines = block.split("\n");
	const allPrefixed = lines.every(spec.hasPrefix);

	const updated = allPrefixed
		? lines.map(spec.stripPrefix)
		: lines.map((line, i) => spec.makePrefix(i) + line);
	const newBlock = updated.join("\n");

	const newValue = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
	return {
		value: newValue,
		selectionStart: lineStart,
		selectionEnd: lineStart + newBlock.length,
	};
}

/** Link: otocz zaznaczenie `[selected](https://)` i zaznacz placeholder URL. */
function applyLink(state: EditorSelection): EditorSelection {
	const { value, selectionStart, selectionEnd } = state;
	const selected = value.slice(selectionStart, selectionEnd);
	const inserted = `[${selected}](${LINK_PLACEHOLDER})`;
	const newValue = value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
	// `[` (1) + selected + `]` (1) + `(` (1) → start placeholdera URL
	const urlStart = selectionStart + selected.length + 3;
	return {
		value: newValue,
		selectionStart: urlStart,
		selectionEnd: urlStart + LINK_PLACEHOLDER.length,
	};
}
