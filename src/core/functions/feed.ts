// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assembleFeedPage } from "@/core/feed";

/**
 * Pobiera jedną stronę feedu po stronie serwera (SSR + RPC).
 * Wykorzystywane przez loader routy feedu (preload do HTML) oraz przez fetchNextPage na kliencie.
 */
export const getFeedPage = createServerFn({ method: "GET" })
	.validator(
		z.object({
			cursor: z.object({ createdAt: z.string(), id: z.string() }).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const { env } = await import("cloudflare:workers");
		return assembleFeedPage({
			cursor: data.cursor,
			imageAccountHash: env.CLOUDFLARE_IMAGES_ACCOUNT_HASH,
		});
	});
