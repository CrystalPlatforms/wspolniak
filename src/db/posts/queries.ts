// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	isNotNull,
	isNull,
	lt,
	not,
	or,
} from "drizzle-orm";
import { users } from "@/db/identity/table";
import { getDb } from "@/db/setup";
import { postImages, posts } from "./table";

export type Post = InferSelectModel<typeof posts>;
export type PostImage = InferSelectModel<typeof postImages>;

interface CreatePostInput {
	authorId: string;
	description: string | null;
	cfImageIds?: string[];
}

export async function createPost(input: CreatePostInput) {
	const { authorId, description, cfImageIds = [] } = input;
	const db = getDb();

	const postId = crypto.randomUUID();
	const postRows = await db.insert(posts).values({ id: postId, authorId, description }).returning();
	const post = postRows[0];
	if (!post) throw new Error("createPost: insert returned no rows");

	const images =
		cfImageIds.length > 0
			? await db
					.insert(postImages)
					.values(
						cfImageIds.map((cfImageId, index) => ({
							id: crypto.randomUUID(),
							postId,
							cfImageId,
							displayOrder: index,
						})),
					)
					.returning()
			: [];

	return { post, images };
}

export interface PostWithAuthorAndImages {
	id: string;
	authorId: string;
	description: string | null;
	createdAt: Date;
	updatedAt: Date;
	author: { id: string; name: string };
	images: PostImage[];
}

type PostJoinRow = {
	post: Post;
	author: { id: string; name: string } | null;
	image: PostImage | null;
};

function aggregatePostRows(rows: PostJoinRow[]): PostWithAuthorAndImages[] {
	const postsMap = new Map<string, PostWithAuthorAndImages>();

	for (const row of rows) {
		const existing = postsMap.get(row.post.id);
		if (existing) {
			if (row.image) existing.images.push(row.image);
		} else {
			postsMap.set(row.post.id, {
				id: row.post.id,
				authorId: row.post.authorId,
				description: row.post.description,
				createdAt: row.post.createdAt,
				updatedAt: row.post.updatedAt,
				author: { id: row.author?.id ?? "", name: row.author?.name ?? "" },
				images: row.image ? [row.image] : [],
			});
		}
	}

	return [...postsMap.values()];
}

export async function listRecentPosts(limit: number): Promise<PostWithAuthorAndImages[]> {
	const rows = await getDb()
		.select({
			post: posts,
			author: { id: users.id, name: users.name },
			image: postImages,
		})
		.from(posts)
		.leftJoin(users, eq(posts.authorId, users.id))
		.leftJoin(postImages, eq(posts.id, postImages.postId))
		.where(isNull(posts.deletedAt))
		.orderBy(desc(posts.createdAt), asc(postImages.displayOrder))
		.limit(limit);

	return aggregatePostRows(rows);
}

interface PaginatedPostsInput {
	limit: number;
	cursor?: { createdAt: string; id: string };
	excludeIds?: string[];
}

interface PaginatedPostsResult {
	posts: PostWithAuthorAndImages[];
	nextCursor: { createdAt: string; id: string } | null;
}

export async function listPaginatedPosts(
	input: PaginatedPostsInput,
): Promise<PaginatedPostsResult> {
	const { limit, cursor, excludeIds = [] } = input;

	const conditions = [isNull(posts.deletedAt)];
	if (excludeIds.length > 0) {
		conditions.push(not(inArray(posts.id, excludeIds)));
	}
	if (cursor) {
		const cursorDate = new Date(cursor.createdAt);
		conditions.push(
			or(
				lt(posts.createdAt, cursorDate),
				and(eq(posts.createdAt, cursorDate), lt(posts.id, cursor.id)),
			)!,
		);
	}

	// Step 1: Get post IDs with limit (no image join — limit applies to posts, not rows)
	const postIdRows = await getDb()
		.select({ id: posts.id })
		.from(posts)
		.where(and(...conditions))
		.orderBy(desc(posts.createdAt), desc(posts.id))
		.limit(limit + 1);

	const hasMore = postIdRows.length > limit;
	const targetIds = postIdRows.slice(0, limit).map((r) => r.id);

	if (targetIds.length === 0) {
		return { posts: [], nextCursor: null };
	}

	// Step 2: Fetch full data with images for those post IDs
	const rows = await getDb()
		.select({
			post: posts,
			author: { id: users.id, name: users.name },
			image: postImages,
		})
		.from(posts)
		.leftJoin(users, eq(posts.authorId, users.id))
		.leftJoin(postImages, eq(posts.id, postImages.postId))
		.where(inArray(posts.id, targetIds))
		.orderBy(desc(posts.createdAt), desc(posts.id), asc(postImages.displayOrder));

	const resultPosts = aggregatePostRows(rows);
	const lastPost = resultPosts[resultPosts.length - 1];
	const nextCursor =
		hasMore && lastPost ? { createdAt: lastPost.createdAt.toISOString(), id: lastPost.id } : null;

	return { posts: resultPosts, nextCursor };
}

export async function getPostById(id: string): Promise<PostWithAuthorAndImages | null> {
	const rows = await getDb()
		.select({
			post: posts,
			author: { id: users.id, name: users.name },
			image: postImages,
		})
		.from(posts)
		.leftJoin(users, eq(posts.authorId, users.id))
		.leftJoin(postImages, eq(posts.id, postImages.postId))
		.where(and(eq(posts.id, id), isNull(posts.deletedAt)))
		.orderBy(asc(postImages.displayOrder));

	const first = rows[0];
	if (!first) return null;
	const images: PostImage[] = [];
	for (const row of rows) {
		if (row.image) images.push(row.image);
	}

	return {
		id: first.post.id,
		authorId: first.post.authorId,
		description: first.post.description,
		createdAt: first.post.createdAt,
		updatedAt: first.post.updatedAt,
		author: { id: first.author?.id ?? "", name: first.author?.name ?? "" },
		images,
	};
}

export async function updatePostDescription(
	id: string,
	description: string | null,
): Promise<Post | null> {
	const rows = await getDb()
		.update(posts)
		.set({ description, updatedAt: new Date() })
		.where(and(eq(posts.id, id), isNull(posts.deletedAt)))
		.returning();

	return rows[0] ?? null;
}

export async function addPostImages(
	postId: string,
	cfImageIds: string[],
	startOrder: number,
): Promise<PostImage[]> {
	if (cfImageIds.length === 0) return [];

	const db = getDb();
	return db
		.insert(postImages)
		.values(
			cfImageIds.map((cfImageId, index) => ({
				id: crypto.randomUUID(),
				postId,
				cfImageId,
				displayOrder: startOrder + index,
			})),
		)
		.returning();
}

export async function deletePostImage(postId: string, imageId: string): Promise<PostImage | null> {
	const rows = await getDb()
		.delete(postImages)
		.where(and(eq(postImages.id, imageId), eq(postImages.postId, postId)))
		.returning();

	return rows[0] ?? null;
}

export async function reorderPostImages(postId: string, imageIds: string[]): Promise<PostImage[]> {
	if (imageIds.length === 0) return [];

	const db = getDb();
	const results: PostImage[] = [];
	for (let i = 0; i < imageIds.length; i++) {
		const imageId = imageIds[i];
		if (!imageId) continue;
		const rows = await db
			.update(postImages)
			.set({ displayOrder: i })
			.where(and(eq(postImages.id, imageId), eq(postImages.postId, postId)))
			.returning();
		const row = rows[0];
		if (row) results.push(row);
	}
	return results;
}

export async function softDeletePost(id: string): Promise<Post | null> {
	const rows = await getDb()
		.update(posts)
		.set({ deletedAt: new Date() })
		.where(and(eq(posts.id, id), isNull(posts.deletedAt)))
		.returning();

	return rows[0] ?? null;
}

export async function countUserPostsToday(userId: string): Promise<number> {
	const startOfDay = new Date();
	startOfDay.setHours(0, 0, 0, 0);

	const rows = await getDb()
		.select({ count: count() })
		.from(posts)
		.where(and(eq(posts.authorId, userId), gte(posts.createdAt, startOfDay)));

	return rows[0]?.count ?? 0;
}

export async function listPostsByIds(ids: string[]): Promise<PostWithAuthorAndImages[]> {
	if (ids.length === 0) return [];
	const rows = await getDb()
		.select({
			post: posts,
			author: { id: users.id, name: users.name },
			image: postImages,
		})
		.from(posts)
		.leftJoin(users, eq(posts.authorId, users.id))
		.leftJoin(postImages, eq(posts.id, postImages.postId))
		.where(and(inArray(posts.id, ids), isNull(posts.deletedAt)))
		.orderBy(asc(postImages.displayOrder));

	const aggregated = aggregatePostRows(rows);
	const byId = new Map(aggregated.map((p) => [p.id, p]));
	return ids.flatMap((id) => {
		const post = byId.get(id);
		return post ? [post] : [];
	});
}

export interface AiPostMatch {
	id: string;
	description: string;
	authorName: string;
	createdAt: Date;
	/** Pierwsze zdjęcie posta wg displayOrder — null = post bez zdjęć. */
	cfImageId: string | null;
}

/**
 * Search-before-answer (F5 #183): keyword search po opisach postów.
 * Zapytanie usera tnie na słowa (≥3 znaki, max 8), SQL wyłapuje kandydatów
 * przez ILIKE ANY, JS liczy wynik = liczba unikalnych tokenów w opisie
 * (remisy: nowszy post wygrywa). Zwraca WYŁĄCZNIE metadane — id, opis,
 * autor, data, pierwsze zdjęcie; bez komentarzy, czatu i bajtów obrazów.
 * Rodzinna skala: pula kandydatów przycięta do 300 najnowszych postów.
 */
export async function searchPostsForAi(query: string, limit: number): Promise<AiPostMatch[]> {
	// Stemowanie naiwne: polskie przypadki docięte do prefiksu („wakacjach” →
	// „wakac”) trafiają w formy bazowe w opisach („wakacje”) i odwrotnie —
	// bez tego keyword search nie znajduje postów po odmienionych słowach.
	const tokens = [
		...new Set(
			query
				.toLowerCase()
				.split(/[^a-ząćęłńóśźż0-9]+/)
				.filter((token) => token.length >= 3)
				.map((token) => (token.length > 5 ? token.slice(0, 5) : token))
				.slice(0, 8),
		),
	];
	if (tokens.length === 0 || limit <= 0) return [];

	const rows = await getDb()
		.select({
			id: posts.id,
			description: posts.description,
			authorName: users.name,
			createdAt: posts.createdAt,
			image: postImages,
		})
		.from(posts)
		.leftJoin(users, eq(posts.authorId, users.id))
		.leftJoin(postImages, eq(posts.id, postImages.postId))
		.where(
			and(
				isNull(posts.deletedAt),
				isNotNull(posts.description),
				or(...tokens.map((token) => ilike(posts.description, `%${token}%`))),
			),
		)
		.orderBy(desc(posts.createdAt), asc(postImages.displayOrder))
		.limit(300);

	// Agregacja: jeden wiersz na post, pierwsze zdjęcie do kart (F5).
	const byId = new Map<string, AiPostMatch>();
	for (const row of rows) {
		const existing = byId.get(row.id);
		if (existing) {
			if (row.image && !existing.cfImageId) existing.cfImageId = row.image.cfImageId;
			continue;
		}
		byId.set(row.id, {
			id: row.id,
			description: row.description ?? "",
			authorName: row.authorName ?? "",
			createdAt: row.createdAt,
			cfImageId: row.image?.cfImageId ?? null,
		});
	}

	// Wynik = liczba unikalnych tokenów w opisie (remisy: nowszy post).
	const scored = [...byId.values()].map((post) => ({
		post,
		score: tokens.reduce(
			(total, token) => total + (post.description.toLowerCase().includes(token) ? 1 : 0),
			0,
		),
	}));
	return scored
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score || b.post.createdAt.getTime() - a.post.createdAt.getTime())
		.slice(0, limit)
		.map((entry) => entry.post);
}
