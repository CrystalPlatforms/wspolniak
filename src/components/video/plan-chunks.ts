// SPDX-License-Identifier: AGPL-3.0-or-later

export interface ChunkPlan {
	/** Pierwszy bajt chunka (włącznie). */
	start: number;
	/** Ostatni bajt chunka (włącznie) — format Content-Range: bytes start-end/total. */
	end: number;
	/** Całkowity rozmiar pliku. */
	total: number;
	/** Kolejny numer chunka (0-based) — do paska postępu. */
	index: number;
}

/**
 * Dzieli plik na chunki o rozmiarze `chunkSize` (ostatni może być mniejszy).
 * Zakresy są włączne (inkluzywny `end`), zgodne z nagłówkiem `Content-Range`.
 * Czysty, deterministyczny — wstrzykiwany do `runVideoUpload` dla testów.
 */
export function planChunks(fileSize: number, chunkSize: number): ChunkPlan[] {
	if (fileSize <= 0) return [];
	const chunks: ChunkPlan[] = [];
	let start = 0;
	let index = 0;
	while (start < fileSize) {
		const end = Math.min(start + chunkSize - 1, fileSize - 1);
		chunks.push({ start, end, total: fileSize, index });
		start = end + 1;
		index++;
	}
	return chunks;
}
