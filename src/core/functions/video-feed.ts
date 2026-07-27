// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { listPaginatedVideos } from "@/db/videos";

/** Rozmiar strony feedu wideo (grid 2-kol → 6 rzędów na desktop). */
const VIDEO_PAGE_SIZE = 12;

/**
 * Pobiera jedną stronę feedu wideo po stronie serwera (SSR + RPC).
 * Używane przez loader trasy `/app/video` (preload do HTML) oraz przez
 * fetchNextPage na kliencie. Daty serializują się do ISO (string) przez RPC.
 */
export const getVideoFeedPage = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			cursor: z.object({ createdAt: z.string(), id: z.string() }).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const result = await listPaginatedVideos({ limit: VIDEO_PAGE_SIZE, cursor: data.cursor });
		return { data: result.videos, meta: { nextCursor: result.nextCursor } };
	});
