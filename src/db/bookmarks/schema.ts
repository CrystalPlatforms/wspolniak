// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";

// POST /bookmarks — body do zapisania posta do Biblioteki.
export const createBookmarkSchema = z.object({
	postId: z.string().min(1),
});

export type CreateBookmarkRequest = z.infer<typeof createBookmarkSchema>;
