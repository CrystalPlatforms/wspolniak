// SPDX-License-Identifier: AGPL-3.0-or-later
import { AppError, type Result } from "@/core/errors";
import {
	attachPostFiles,
	deletePostFilesByPost,
	detachRemovedPostFiles,
	listPostFilesByKeys,
} from "@/db/post-files/queries";
import { MAX_POST_FILE_BYTES, type PostFileMeta } from "@/db/post-files/schema";

/**
 * Storage załączników postów (#243) — deep module nad R2: upload, weryfikacja
 * kluczy i cleanup za jednym wąskim interfejsem. Bajty idą do bucketa POST_FILES
 * pod gołym UUID; nazwa/typ lecą w metadanych obiektu. Endpointy API zostają
 * cienkie (walidacja HTTP + wywołania stąd). Orphan uploady (upload bez
 * attacha) są tolerowane świadomie — bez crona sprzątającego (YAGNI, PRD #240).
 */

/** Kształt "pliku" z multipartu FormData (workerd: File z arrayBuffer/size/name). */
export function isFileLike(value: FormDataEntryValue | null): value is File {
	return (
		typeof value === "object" &&
		value !== null &&
		"arrayBuffer" in value &&
		"size" in value &&
		"name" in value
	);
}

/**
 * Upload JEDNEGO pliku do R2 (#243): limity 19 MB i blokada wideo pilnuje
 * serwer (nie ufamy klientowi), klucz = świeży UUID. Zwraca metadane do
 * odesłania klientowi — dokładnie ten kształt idzie potem do attachu.
 */
export async function uploadPostFile(bucket: R2Bucket, file: File): Promise<Result<PostFileMeta>> {
	const mimeType = file.type || "application/octet-stream";
	if (file.size > MAX_POST_FILE_BYTES) {
		return {
			ok: false,
			error: new AppError(`Plik "${file.name}" przekracza limit 19 MB`, "VALIDATION", 400),
		};
	}
	if (mimeType.startsWith("video/")) {
		return {
			ok: false,
			error: new AppError(
				`Plik "${file.name}" — pliki wideo nie są obsługiwane`,
				"VALIDATION",
				400,
			),
		};
	}
	const key = crypto.randomUUID();
	const name = (file.name || "plik").slice(0, 200);
	await bucket.put(key, file, {
		httpMetadata: { contentType: mimeType },
		customMetadata: { name },
	});
	return { ok: true, data: { key, name, size: file.size, mimeType } };
}

/**
 * Weryfikuje, że klucze z uploadu naprawdę istnieją w buckecie (attach po key
 * nie może wskazywać na powietrze — nieznan klucz = 400). Wylicza head równolegle.
 */
export async function verifyPostFileKeys(bucket: R2Bucket, keys: string[]): Promise<Result<void>> {
	const heads = await Promise.all(keys.map((key) => bucket.head(key)));
	const missing = keys.filter((_, index) => !heads[index]);
	if (missing.length > 0) {
		return {
			ok: false,
			error: new AppError(
				"Plik nie został znaleziony — spróbuj wysłać go ponownie",
				"VALIDATION",
				400,
			),
		};
	}
	return { ok: true, data: undefined };
}

/** Kasuje obiekty z R2 (po usunięciu wierszy). Pojedyncza porażka wywala całość. */
async function deletePostFileObjects(bucket: R2Bucket, keys: string[]): Promise<void> {
	await Promise.all(keys.map((key) => bucket.delete(key)));
}

/**
 * Sync plików posta przy edycji (#243): lista `desired` to PEŁNA docelowa
 * lista (istniejące zostawione + nowe po uploadzie). Klucze cudze (przyczepione
 * do innego posta) → 400; nieznane → 400 (head); brakujące na liście → usunięte
 * z bazy i z R2 od razu.
 */
export async function syncPostFiles(
	bucket: R2Bucket,
	postId: string,
	desired: PostFileMeta[],
): Promise<Result<void>> {
	const desiredKeys = desired.map((file) => file.key);
	if (new Set(desiredKeys).size !== desiredKeys.length) {
		return {
			ok: false,
			error: new AppError("Ta sama plik jest przyczepiony dwukrotnie", "VALIDATION", 400),
		};
	}

	const existing = await listPostFilesByKeys(desiredKeys);
	const foreign = existing.find((row) => row.postId !== postId);
	if (foreign) {
		return {
			ok: false,
			error: new AppError("Plik jest już przyczepiony do innego posta", "VALIDATION", 400),
		};
	}

	const ownKeys = new Set(existing.filter((row) => row.postId === postId).map((row) => row.key));
	const fresh = desired.filter((file) => !ownKeys.has(file.key));
	const verify = await verifyPostFileKeys(
		bucket,
		fresh.map((file) => file.key),
	);
	if (!verify.ok) return verify;

	if (fresh.length > 0) await attachPostFiles(postId, fresh);
	const removedKeys = await detachRemovedPostFiles(postId, desiredKeys);
	await deletePostFileObjects(bucket, removedKeys);
	return { ok: true, data: undefined };
}

/**
 * Cleanup przy usuwaniu posta (#243): wiersze z bazy, potem obiekty z R2.
 * Post jest soft-delete bez ścieżki restore, więc natychmiastowe kasowanie
 * obiektów jest bezpieczne (decyzja PRD #240).
 */
export async function purgePostFiles(bucket: R2Bucket, postId: string): Promise<void> {
	const keys = await deletePostFilesByPost(postId);
	await deletePostFileObjects(bucket, keys);
}
