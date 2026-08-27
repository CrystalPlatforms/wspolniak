// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";

/** Limit tytułu albumu (#170) — jedno źródło prawdy dla serwera i formularza. */
export const MAX_ALBUM_TITLE_LENGTH = 100;

/**
 * Batch startowy przy tworzeniu albumu — mirror limitu kompozytora posta
 * (`MAX_IMAGES` w new-post-form). Cap 500 elementów/album dotyczy docelowo
 * dołączania kolejnych zdjęć (F2/F3).
 */
export const MAX_INITIAL_PHOTOS = 10;

// POST /albums — tytuł + ≥1 własne zdjęcie (identyfikator CF Images).
export const createAlbumSchema = z.object({
	title: z.string().trim().min(1, "Tytuł jest wymagany").max(MAX_ALBUM_TITLE_LENGTH),
	photoIds: z
		.array(z.string().min(1))
		.min(1, "Dodaj co najmniej jedno zdjęcie")
		.max(MAX_INITIAL_PHOTOS),
});

export type CreateAlbumRequest = z.infer<typeof createAlbumSchema>;
