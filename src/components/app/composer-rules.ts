// SPDX-License-Identifier: AGPL-3.0-or-later
import { type MediaItem, toMediaItem, type VideoDraft } from "@/components/app/composer-image-grid";
import { MAX_POST_FILE_BYTES, MAX_POST_FILES } from "@/db/post-files/schema";
import { MAX_DESCRIPTION_LENGTH, MAX_POST_VIDEOS } from "@/db/posts/schema";

export const MAX_FILE_SIZE_MB = 19;
/** Limit zdjęć kompozytora (jedno źródło prawdy dla walidacji i tytułu przycisku). */
const MAX_IMAGES = 10;

/** Wynik podziału wyboru z wybierarki na kafelki (reviza usera). */
export interface AttachmentSplit {
	images: MediaItem[];
	videos: VideoDraft[];
	files: File[];
	errors: string[];
}

/** Aktualne zapełnienie kafelków — limity liczone per typ. */
export interface AttachmentCounts {
	images: number;
	videos: number;
	files: number;
}

/**
 * Wybór z wybierarki „Dodaj załączniki” dzieli się po MIME na zdjęcia, wideo
 * (tytuł z nazwy pliku) i pliki. Limity liczby i rozmiaru liczone są per typ,
 * razem z tym, co już jest w poście — tworzenie i edycja dzielą tę samą regułę
 * (#251).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: liniowy klasyfikator MIME z limitami — split na helpery zaciemniłby kod
export function splitAttachmentFiles(incoming: File[], counts: AttachmentCounts): AttachmentSplit {
	const split: AttachmentSplit = { images: [], videos: [], files: [], errors: [] };
	for (const file of incoming) {
		const mime = file.type || "application/octet-stream";
		if (mime.startsWith("image/")) {
			if (counts.images + split.images.length >= MAX_IMAGES) {
				// #250: prosty komunikat limitu — bez nazwy pliku, bez powtórzeń.
				split.errors.push(`Maksymalnie ${MAX_IMAGES} mediów`);
				continue;
			}
			split.images.push(toMediaItem(file, counts.images + split.images.length));
		} else if (mime.startsWith("video/")) {
			if (counts.videos + split.videos.length >= MAX_POST_VIDEOS) {
				split.errors.push(`${file.name}: limit ${MAX_POST_VIDEOS} wideo`);
				continue;
			}
			split.videos.push({
				key: `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				file,
				title: file.name.replace(/\.[^.]+$/, "").trim(),
				preview: URL.createObjectURL(file),
			});
		} else {
			if (counts.files + split.files.length >= MAX_POST_FILES) {
				split.errors.push(`${file.name}: limit ${MAX_POST_FILES} plików`);
				continue;
			}
			if (file.size > MAX_POST_FILE_BYTES) {
				split.errors.push(`${file.name}: przekracza limit ${MAX_FILE_SIZE_MB} MB`);
				continue;
			}
			split.files.push(file);
		}
	}
	return split;
}

/** Komunikat dla posta bez treści — ten sam przy tworzeniu i edycji (#251). */
export const EMPTY_POST_MESSAGE = "Dodaj tekst, załączniki, ankietę albo położenie";

/** Co liczy się jako treść posta — do aktywności przycisku i sprawdzenia przy wysyłce. */
export interface ComposerContent {
	description: string;
	images: number;
	videos: number;
	files: number;
	hasPoll: boolean;
	hasLocation: boolean;
}

/** Czy post ma jakąkolwiek treść (tekst, cokolwiek z załączników, ankietę albo położenie). */
export function hasComposerContent(content: ComposerContent): boolean {
	return (
		content.images > 0 ||
		content.videos > 0 ||
		content.files > 0 ||
		content.description.trim().length > 0 ||
		content.hasPoll ||
		content.hasLocation
	);
}

/** Komunikat o za dużym zdjęciu (issue #200) — klik podglądu otwiera dialog zmniejszania. */
export function oversizedImageMessage(fileName: string): string {
	return `Zdjęcie "${fileName}" jest za duże. Kliknij jego podgląd i zmniejsz je, albo usuń je przed publikacją.`;
}

/** Komunikat o za długim opisie (limit znaków z serwerowego schematu posta). */
export function descriptionTooLongMessage(length: number): string {
	return `Tekst posta jest za długi. Limit to ${MAX_DESCRIPTION_LENGTH} znaków, wpisanych: ${length}`;
}
