// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";

/** Maks. rozmiar pliku wideo — 2 GiB (AC: plik 2 GB kończy upload). */
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

/** Limit wgranych wideo na instancję dzień (okno UTC, reset o północy). */
export const DAILY_VIDEO_LIMIT = 5;

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
 * Wejście `POST /api/video/confirm` — passthrough (Video v2 #194): endpoint NIC
 * nie zapisuje, tylko oddaje klientowi dane ostatniego chunka, które ten osadza
 * w payloadzie posta. `title` mieszka po stronie kompozytora — nie przechodzi
 * przez confirm.
 */
export const confirmVideoSchema = z.object({
	youtubeVideoId: z.string().min(1),
	thumbnailUrl: z.string().url(),
});

export type ConfirmVideoRequest = z.infer<typeof confirmVideoSchema>;

/**
 * Wejście `POST /api/video/yt-delete` (Video v2 F3 #197) — usuwanie klipu z
 * YouTube przez admin OAuth. Fire-and-forget: błąd YouTube jest tylko logowany.
 */
export const youtubeDeleteSchema = z.object({
	youtubeVideoId: z.string().min(1),
});

export type YoutubeDeleteRequest = z.infer<typeof youtubeDeleteSchema>;
