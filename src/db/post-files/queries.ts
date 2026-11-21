// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { getDb } from "@/db/setup";
import type { PostFileEntry, PostFileMeta } from "./schema";
import { postFiles } from "./table";

/** Dokleja wiersze metadanych plików do posta (attach po uploadzie). */
export async function attachPostFiles(postId: string, files: PostFileMeta[]): Promise<void> {
	if (files.length === 0) return;
	await getDb()
		.insert(postFiles)
		.values(
			files.map((file) => ({
				id: crypto.randomUUID(),
				postId,
				key: file.key,
				name: file.name,
				size: file.size,
				mimeType: file.mimeType,
			})),
		);
}

/** Pliki jednego posta (kolejność = kolejność attachu) — kształt do renderu. */
export async function listPostFiles(postId: string): Promise<PostFileEntry[]> {
	const rows = await getDb()
		.select({
			id: postFiles.id,
			key: postFiles.key,
			name: postFiles.name,
			size: postFiles.size,
			mimeType: postFiles.mimeType,
		})
		.from(postFiles)
		.where(eq(postFiles.postId, postId));
	return rows;
}

/**
 * Pliki wielu postów w jednym zapytaniu (batch feedu/Biblioteki) — mapa
 * postId -> lista plików; posty bez plików nie mają klucza.
 */
export async function listPostFilesByPostIds(
	postIds: string[],
): Promise<Map<string, PostFileEntry[]>> {
	const map = new Map<string, PostFileEntry[]>();
	if (postIds.length === 0) return map;
	const rows = await getDb()
		.select({
			id: postFiles.id,
			postId: postFiles.postId,
			key: postFiles.key,
			name: postFiles.name,
			size: postFiles.size,
			mimeType: postFiles.mimeType,
		})
		.from(postFiles)
		.where(inArray(postFiles.postId, postIds));
	for (const row of rows) {
		const list = map.get(row.postId) ?? [];
		list.push({ id: row.id, key: row.key, name: row.name, size: row.size, mimeType: row.mimeType });
		map.set(row.postId, list);
	}
	return map;
}

/** Jeden plik posta (z kluczem R2) — do endpointu pobierania. */
export async function getPostFile(
	postId: string,
	fileId: string,
): Promise<{ id: string; key: string; name: string; mimeType: string } | null> {
	const rows = await getDb()
		.select({
			id: postFiles.id,
			key: postFiles.key,
			name: postFiles.name,
			mimeType: postFiles.mimeType,
		})
		.from(postFiles)
		.where(and(eq(postFiles.id, fileId), eq(postFiles.postId, postId)))
		.limit(1);
	return rows[0] ?? null;
}

/** Wiersze o podanych kluczach — pilnuje kluczy cudzych i już przyczepionych. */
export async function listPostFilesByKeys(
	keys: string[],
): Promise<{ key: string; postId: string }[]> {
	if (keys.length === 0) return [];
	return getDb()
		.select({ key: postFiles.key, postId: postFiles.postId })
		.from(postFiles)
		.where(inArray(postFiles.key, keys));
}

/**
 * Sync plików przy edycji (#243): usuwa wiersze posta, których kluczy nie ma
 * na nowej liście, i zwraca ich klucze (rodzic kasuje potem obiekty z R2).
 */
export async function detachRemovedPostFiles(
	postId: string,
	keepKeys: string[],
): Promise<string[]> {
	const removed = await getDb()
		.delete(postFiles)
		.where(
			keepKeys.length > 0
				? and(eq(postFiles.postId, postId), notInArray(postFiles.key, keepKeys))
				: eq(postFiles.postId, postId),
		)
		.returning({ key: postFiles.key });
	return removed.map((row) => row.key);
}

/** Czyści WSZYSTKIE pliki posta (delete posta) — zwraca klucze do kasowania w R2. */
export async function deletePostFilesByPost(postId: string): Promise<string[]> {
	const removed = await getDb()
		.delete(postFiles)
		.where(eq(postFiles.postId, postId))
		.returning({ key: postFiles.key });
	return removed.map((row) => row.key);
}
