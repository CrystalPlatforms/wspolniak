// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	type InferSelectModel,
	inArray,
	lt,
	or,
} from "drizzle-orm";
import { users } from "@/db/identity/table";
import { getDb } from "@/db/setup";
import { postVideos, videos } from "./table";

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

/**
 * Hard-deletes a video record (F4). Zwraca usunięty rekord (z `youtubeVideoId`,
 * którego potrzebuje warstwa API do usunięcia z YouTube) lub `null`, gdy nie
 * istniał. Tabela `videos` nie ma soft-delete — usunięcie jest trwałe.
 */
export async function deleteVideo(id: string): Promise<Video | null> {
	const rows = await getDb().delete(videos).where(eq(videos.id, id)).returning();
	return rows[0] ?? null;
}

/** Kursor paginacji feedu wideo — stabilny porządek (createdAt DESC, id DESC). */
export interface VideoListCursor {
	createdAt: string;
	id: string;
}

/** Wideo z imieniem autora — element listy feedu. */
export interface VideoFeedItem extends Video {
	author: { id: string; name: string };
}

export interface ListPaginatedVideosInput {
	limit: number;
	cursor?: VideoListCursor;
}

export interface ListPaginatedVideosResult {
	videos: VideoFeedItem[];
	nextCursor: VideoListCursor | null;
}

/**
 * Lista wideo najnowsze-pierwsze z paginacją kursorem (mirror `listPaginatedPosts`).
 * `limit + 1` wykrywa "jest więcej"; `nextCursor` = ostatni element strony.
 */
export async function listPaginatedVideos(
	input: ListPaginatedVideosInput,
): Promise<ListPaginatedVideosResult> {
	const { limit, cursor } = input;

	const conditions = [];
	if (cursor) {
		const cursorDate = new Date(cursor.createdAt);
		conditions.push(
			or(
				lt(videos.createdAt, cursorDate),
				and(eq(videos.createdAt, cursorDate), lt(videos.id, cursor.id)),
			),
		);
	}

	const base = getDb()
		.select({
			id: videos.id,
			youtubeVideoId: videos.youtubeVideoId,
			title: videos.title,
			description: videos.description,
			authorId: videos.authorId,
			thumbnailUrl: videos.thumbnailUrl,
			createdAt: videos.createdAt,
			author: { id: users.id, name: users.name },
		})
		.from(videos)
		.leftJoin(users, eq(videos.authorId, users.id));

	const rows = await (conditions.length > 0 ? base.where(and(...conditions)) : base)
		.orderBy(desc(videos.createdAt), desc(videos.id))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const page = rows.slice(0, limit).map((row) => ({
		// leftJoin → author może być null gdy autor nie istnieje; koercja jak w postach.
		...row,
		author: row.author ?? { id: "", name: "" },
	}));
	const last = page[page.length - 1];
	const nextCursor =
		hasMore && last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null;

	return { videos: page, nextCursor };
}

/**
 * Pojedyncze wideo z imieniem autora (strona szczegółów /app/video/$id).
 * `null` gdy nie istnieje.
 */
export async function getVideoById(id: string): Promise<VideoFeedItem | null> {
	const rows = await getDb()
		.select({
			id: videos.id,
			youtubeVideoId: videos.youtubeVideoId,
			title: videos.title,
			description: videos.description,
			authorId: videos.authorId,
			thumbnailUrl: videos.thumbnailUrl,
			createdAt: videos.createdAt,
			author: { id: users.id, name: users.name },
		})
		.from(videos)
		.leftJoin(users, eq(videos.authorId, users.id))
		.where(eq(videos.id, id));
	const row = rows[0];
	return row ? { ...row, author: row.author ?? { id: "", name: "" } } : null;
}

export type PostVideoLink = InferSelectModel<typeof postVideos>;

/**
 * Ustawia uporządkowaną listę wideo przypiętych do posta (semantyka replace):
 * usuwa wszystkie dotychczasowe przypięcia tego posta, a następnie wstawia nową
 * listę z `position` równym indeksowi w tablicy. Jedno wywołanie obsługuje
 * dodawanie, usuwanie i zmianę kolejności — idempotentne (AC F5 #4).
 * Pusta lista odpija wszystkie wideo od posta. Zwraca wstawione wiersze łączące.
 *
 * Klucz złożony `(post_id, video_id)` chroni przed duplikatami nawet przy współbieżności.
 */
export async function setPostVideos(postId: string, videoIds: string[]): Promise<PostVideoLink[]> {
	const db = getDb();
	await db.delete(postVideos).where(eq(postVideos.postId, postId));
	if (videoIds.length === 0) return [];
	const rows = await db
		.insert(postVideos)
		.values(videoIds.map((videoId, position) => ({ postId, videoId, position })))
		.returning();
	return rows;
}

/** Wideo przypięte do posta — pełne dane filmu + `position` w poście. */
export interface PostVideo extends VideoFeedItem {
	position: number;
}

/**
 * Batchowy odczyt wideo przypiętych do wielu postów (mirror `countCommentsByPosts`).
 * Zwraca Mapę postId → lista `PostVideo` posortowana rosnąco po `position`.
 * `innerJoin videos` sprawia, że wideo usunięte w F4 (sierota w `post_videos`)
 * nie pojawia się w wyniku. Pusta lista postów → pusta Mapa (bez zapytania).
 */
export async function listVideosByPostIds(postIds: string[]): Promise<Map<string, PostVideo[]>> {
	if (postIds.length === 0) return new Map();

	const rows = await getDb()
		.select({
			postId: postVideos.postId,
			position: postVideos.position,
			id: videos.id,
			youtubeVideoId: videos.youtubeVideoId,
			title: videos.title,
			description: videos.description,
			authorId: videos.authorId,
			thumbnailUrl: videos.thumbnailUrl,
			createdAt: videos.createdAt,
			author: { id: users.id, name: users.name },
		})
		.from(postVideos)
		.innerJoin(videos, eq(postVideos.videoId, videos.id))
		.leftJoin(users, eq(videos.authorId, users.id))
		.where(inArray(postVideos.postId, postIds))
		.orderBy(asc(postVideos.postId), asc(postVideos.position));

	const map = new Map<string, PostVideo[]>();
	for (const row of rows) {
		const list = map.get(row.postId) ?? [];
		list.push({
			id: row.id,
			youtubeVideoId: row.youtubeVideoId,
			title: row.title,
			description: row.description,
			authorId: row.authorId,
			thumbnailUrl: row.thumbnailUrl,
			createdAt: row.createdAt,
			author: row.author ?? { id: "", name: "" },
			position: row.position,
		});
		map.set(row.postId, list);
	}
	return map;
}

/** Limit wgranych wideo na instancję dzień (okno UTC, reset o północy). */
export const DAILY_VIDEO_LIMIT = 3;
