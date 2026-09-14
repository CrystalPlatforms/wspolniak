// SPDX-License-Identifier: AGPL-3.0-or-later
import { compressImage } from "./compress";

/**
 * Zmniejszanie zdjęcia poniżej limitu rozmiaru (issue #200): używane w dialogu
 * błędu „za duże zdjęcie" — jedna akcja, która realnie redukuje rozmiar pliku.
 */

/** Kolejne próby kompresji — od najlepszej jakości do najmniejszego pliku. */
const SHRINK_ATTEMPTS = [
	{ maxWidth: 1600, quality: 0.7 },
	{ maxWidth: 1200, quality: 0.6 },
	{ maxWidth: 1000, quality: 0.5 },
	{ maxWidth: 800, quality: 0.4 },
] as const;

/** Zmniejszanie nie dało pliku pod limitem — użytkownik musi dodać mniejsze zdjęcie. */
export class ShrinkError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ShrinkError";
	}
}

/**
 * Zmniejsza zdjęcie tak, by mieściło się w `maxBytes` (issue #200): kolejne próby
 * przez compressImage (Web Worker) aż do pierwszego wyniku **pod limitem i
 * mniejszego od oryginału** (twardy wymóg #200). Rzuca `ShrinkError`, gdy żadna
 * próba nie wystarczy. Wynik to webp — ta sama ścieżka co przy normalnym uploadzie.
 */
export async function shrinkImageToLimit(file: File, maxBytes: number): Promise<File> {
	for (const options of SHRINK_ATTEMPTS) {
		const shrunk = await compressImage(file, { ...options });
		if (shrunk.size < maxBytes && shrunk.size < file.size) {
			return shrunk;
		}
	}
	throw new ShrinkError(
		`Nie udało się zmniejszyć zdjęcia „${file.name}" poniżej limitu — usuń je i dodaj mniejsze.`,
	);
}
