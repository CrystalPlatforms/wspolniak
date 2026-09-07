// SPDX-License-Identifier: AGPL-3.0-or-later
import { count, gte } from "drizzle-orm";
import { getDb } from "@/db/setup";
import { videoUploadEvents } from "./table";

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
 * Liczba sesji uploadu otwartych dzisiaj (okno UTC, niezależne od TZ runtimeu).
 * `now` wstrzykiwane dla testów; domyślnie bieżący czas.
 */
export async function countTodayUTC(now: Date = new Date()): Promise<number> {
	const rows = await getDb()
		.select({ count: count() })
		.from(videoUploadEvents)
		.where(gte(videoUploadEvents.createdAt, utcDayStart(now)));
	return rows[0]?.count ?? 0;
}

/**
 * Dokłada wpis do dziennego logu uploadów — wołane przy otwarciu sesji
 * resumable, żeby limit dzienny działał bez tabeli `videos` (Video v2 #194).
 */
export async function logUploadEvent(authorId: string): Promise<void> {
	await getDb().insert(videoUploadEvents).values({ id: crypto.randomUUID(), authorId });
}
