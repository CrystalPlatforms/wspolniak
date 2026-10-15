// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Komendy ukośnika czatu (#214 — Chat F1). `/ankieta` doszła w F2 (#215),
 * `/polozenie` w F3 (#216), `/dodaj` w F4 (#217), `/wydarzenie` w F6 (#219).
 */
export interface ChatCommand {
	/** Nazwa z ukośnikiem, np. `/link`. */
	name: string;
	/** Krótki opis podpowiedzi w pickerze. */
	description: string;
}

export const CHAT_COMMANDS: ChatCommand[] = [
	{ name: "/link", description: "Wstaw link" },
	{ name: "/ankieta", description: "Utwórz ankietę" },
	{ name: "/polozenie", description: "Udostępnij lokalizację" },
	{ name: "/dodaj", description: "Załącz pliki" },
	{ name: "/wydarzenie", description: "Wstaw szablon propozycji daty" },
];

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
