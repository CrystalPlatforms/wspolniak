// SPDX-License-Identifier: AGPL-3.0-or-later
import { count, gte, type InferSelectModel } from "drizzle-orm";
import { getDb } from "@/db/setup";
import { videos } from "./table";

/**
 * Północ UTC dla podanego momentu — dolna granica okna "dziś" dla limitu
 * 3 wideo / dzień (reset o północy UTC).
 *
 * Obliczana JAWNIE przez UTC (getUTC*), a nie `setHours(0,0,0,0)`, które używa
 * czasu lokalnego runtimeu — na Cloudflare Workers to przypadkiem UTC, ale
 * jawny UTC jest poprawny niezależnie od środowiska i testowalny.
 */
export function utcDayStart(date: Date): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Liczba wideo wgranych dzisiaj (okno UTC, niezależne od TZ runtimeu).
 * `now` wstrzykiwane dla testów; domyślnie bieżący czas.
 */
export async function countTodayUTC(now: Date = new Date()): Promise<number> {
	const rows = await getDb()
		.select({ count: count() })
		.from(videos)
		.where(gte(videos.createdAt, utcDayStart(now)));
	return rows[0]?.count ?? 0;
}

export type Video = InferSelectModel<typeof videos>;

export interface CreateVideoInput {
	youtubeVideoId: string;
	title: string;
	description: string | null;
	authorId: string;
	thumbnailUrl: string;
}

/**
 * Zapisuje rekord wideo po pomyślnym uploadie do YouTube (confirm).
 * `id` generowane serwerowo (`crypto.randomUUID`), `authorId` pochodzi z sesji.
 */
export async function createVideo(input: CreateVideoInput): Promise<Video> {
	const id = crypto.randomUUID();
	const rows = await getDb()
		.insert(videos)
		.values({ id, ...input })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("createVideo: insert returned no rows");
	return row;
}

/** Limit wgranych wideo na instancję dzień (okno UTC, reset o północy). */
export const DAILY_VIDEO_LIMIT = 3;
