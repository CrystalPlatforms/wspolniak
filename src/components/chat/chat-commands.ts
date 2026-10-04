// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Komendy ukośnika czatu (#214 — Chat F1). W F1 istnieje tylko `/link`;
 * kolejne (`/ankieta`, `/polozenie`, `/dodaj`, `/wydarzenie`) dojdą w
 * kolejnych fazach rozbudowy czatu (PRD #201).
 */
export interface ChatCommand {
	/** Nazwa z ukośnikiem, np. `/link`. */
	name: string;
	/** Krótki opis podpowiedzi w pickerze. */
	description: string;
}

export const CHAT_COMMANDS: ChatCommand[] = [{ name: "/link", description: "Wstaw link" }];

export interface CommandDetection {
	/** Indeks `/` w oryginalnym tekście. */
	startIndex: number;
	/** Tekst między `/` a karetą. Może być pusty zaraz po wpisaniu `/`. */
	query: string;
}

/**
 * Wykrycie aktywnego triggera `/` względem karety — te same reguły co
 * `detectMentionQuery` (#168): `/` na początku lub po białym znaku, między
 * `/` a karetą brak białego znaku. Dzięki temu `https://…` i `a/b` w środku
 * słowa nie otwierają pickera komend.
 */
export function detectCommandQuery(text: string, caret: number): CommandDetection | null {
	const before = text.slice(0, caret);
	const slash = before.lastIndexOf("/");
	if (slash === -1) return null;

	// `/` musi być na początku lub po białym znaku — inaczej to ścieżka, nie komenda.
	if (slash > 0 && !/\s/.test(text[slash - 1] ?? "")) return null;

	const query = before.slice(slash + 1);
	// Biały znak między `/` a karetą kończy komendę.
	if (/\s/.test(query)) return null;

	return { startIndex: slash, query };
}

/** Komendy widoczne w pickerze dla wpisanego query (prefiks, case-insensitive). */
export function filterCommands(query: string): ChatCommand[] {
	const prefix = `/${query.toLowerCase()}`;
	return CHAT_COMMANDS.filter((command) => command.name.toLowerCase().startsWith(prefix));
}
