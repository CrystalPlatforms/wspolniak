// SPDX-License-Identifier: AGPL-3.0-or-later

/** Akcja formatowania inline obsługiwana przez toolbar. */
export type MarkdownAction = "bold" | "italic" | "strikethrough";

/** Stan edytora: tekst + bieżące zaznaczenie (kursor, gdy start === end). */
export interface EditorSelection {
	value: string;
	selectionStart: number;
	selectionEnd: number;
}

/** Znaczniki Markdown otaczające zaznaczenie z obu stron dla danej akcji. */
const MARKERS: Record<MarkdownAction, string> = {
	bold: "**",
	italic: "*",
	strikethrough: "~~",
};

/**
 * Czysty (bez DOM) deep module: transformuje stan edytora + akcję w nowy stan.
 *
 * Inline toggle: otacza zaznaczenie znacznikami (wrap), wstawia puste znaczniki
 * przy kursorze gdy brak zaznaczenia (insert), oraz zdejmuje znaczniki gdy tekst
 * jest już nimi otoczony (unwrap). Cała logika selekcji DOM żyje w komponencie.
 */
export function applyMarkdown(state: EditorSelection, action: MarkdownAction): EditorSelection {
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
