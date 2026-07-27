// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";

/** Maks. rozmiar pliku wideo — 2 GiB (AC: plik 2 GB kończy upload). */
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Wejście `POST /api/video/upload-session`.
 * `size`/`mime` trafiają do nagłówków `X-Upload-Content-*` sesji resumable.
 * Górna granica rozmiaru sprawdzana w handlerze (→ 413), nie w schemacie.
 */
export const startUploadSchema = z.object({
	title: z.string().min(1, "Tytuł jest wymagany").max(100),
	description: z
		.string()
		.max(5000)
		.nullish()
		.transform((v) => v ?? null),
	size: z.number().int().nonnegative(),
	mime: z.string().min(1),
});

export type StartUploadRequest = z.infer<typeof startUploadSchema>;

/**
 * Wejście `POST /api/video/confirm` — zapis rekordu wideo po uploadzie.
 * `youtubeVideoId` i `thumbnailUrl` pochodzą z odpowiedzi ostatniego chunka;
 * `title`/`description` są oryginalnym wejściem użytkownika (klient odsyła).
 * `authorId` doklejane jest w handlerze z sesji (NIE z ciała).
 */
export const confirmVideoSchema = z.object({
	youtubeVideoId: z.string().min(1),
	title: z.string().min(1, "Tytuł jest wymagany").max(100),
	description: z
		.string()
		.max(5000)
		.nullish()
		.transform((v) => v ?? null),
	thumbnailUrl: z.string().url(),
});

export type ConfirmVideoRequest = z.infer<typeof confirmVideoSchema>;
