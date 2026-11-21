// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";

/** Limity załączników postów (#243): 5 plików × 19 MB, wideo wykluczone (PRD #240). */
export const MAX_POST_FILES = 5;
export const MAX_POST_FILE_BYTES = 19 * 1024 * 1024;

/** Klucz obiektu R2 = goły UUID (generujemy go sami — regex zamyka ścieżki i cudze klucze). */
export const POST_FILE_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Metadane pliku w API (#243): klient dostaje je z uploadu i odsyła przy
 * attachu create/update posta. Serwer przechowuje je w `post_files`.
 */
export const postFileMetaSchema = z
	.object({
		key: z.string().regex(POST_FILE_KEY_RE, "Nieprawidłowy klucz pliku"),
		name: z
			.string()
			.trim()
			.min(1, "Nazwa pliku nie może być pusta")
			.max(200, "Nazwa pliku może mieć maksymalnie 200 znaków"),
		size: z.number().int().positive().max(MAX_POST_FILE_BYTES, "Plik przekracza limit 19 MB"),
		mimeType: z
			.string()
			.min(1)
			.max(100)
			.refine((type) => !type.startsWith("video/"), "Pliki wideo nie są obsługiwane"),
	})
	.strict();

/** Metadane pliku przesłane przez klienta przy attachu. */
export type PostFileMeta = z.infer<typeof postFileMetaSchema>;

/**
 * Plik w odpowiedziach API (GET posta, lista w karcie). `key` wychodzi do
 * klienta świadomie: edycja posta attachmentuje po key (kontrakt #243), a
 * pobieranie i tak biegnie przez autoryzowany endpoint, więc sam UUID niczym
 * nie zasila anonimowego odbiorcę.
 */
export interface PostFileEntry {
	id: string;
	key: string;
	name: string;
	size: number;
	mimeType: string;
}
