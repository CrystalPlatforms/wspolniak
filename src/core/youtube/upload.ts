// SPDX-License-Identifier: AGPL-3.0-or-later
// YouTube resumable upload (F2). Pure over an injected config + fetcher:
// tests mock only Google's API (system boundary), never our own modules.

import { AppError } from "@/core/errors";
import { type YoutubeConfig, youtubeError } from "./oauth";

const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos";

export interface StartUploadMeta {
	title: string;
	description: string | null;
	/** Całkowity rozmiar pliku (bajty) — nagłówek X-Upload-Content-Length. */
	size: number;
	/** MIME pliku — nagłówek X-Upload-Content-Type. */
	mime: string;
}

/**
 * Rozpoczyna sesję uploadu resumable. Zwraca URL sesji (nagłówek `Location`),
 * pod który klient będzie PUTować chunki (przez Worker). Wideo od razu ustawiane
 * jako **unlisted** (`status.privacyStatus`).
 */
export async function startResumableUpload(
	accessToken: string,
	meta: StartUploadMeta,
	_config: YoutubeConfig,
	fetchFn: typeof fetch = fetch,
): Promise<{ sessionUrl: string }> {
	const url = `${UPLOAD_ENDPOINT}?uploadType=resumable&part=snippet,status`;
	const res = await fetchFn(url, {
		method: "POST",
		headers: {
			authorization: `Bearer ${accessToken}`,
			"content-type": "application/json",
			"x-upload-content-length": String(meta.size),
			"x-upload-content-type": meta.mime,
		},
		body: JSON.stringify({
			snippet: { title: meta.title, description: meta.description ?? "" },
			status: { privacyStatus: "unlisted" },
		}),
	});
	if (!res.ok) throw youtubeError(res, "rozpoczęcia sesji uploadu wideo");

	const sessionUrl = res.headers.get("location");
	if (!sessionUrl) {
		throw new AppError("YouTube: brak URL sesji uploadu", "INTERNAL", 502);
	}
	return { sessionUrl };
}

export interface YoutubeThumbnails {
	default?: { url: string };
	medium?: { url: string };
	high?: { url: string };
	standard?: { url: string };
	maxres?: { url: string };
}

/**
 * Wybiera najlepszy dostępny URL miniatury z zasobu wideo YouTube
 * (malejąco po rozdzielczości). Zawsze zwraca ciąg — `""` jako ostateczny
 * fallback (YouTube zawsze zwraca co najmniej `default`).
 */
export function pickThumbnail(snippet: { thumbnails?: YoutubeThumbnails }): string {
	const t = snippet.thumbnails;
	return (
		t?.maxres?.url ?? t?.standard?.url ?? t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? ""
	);
}

export interface ChunkRange {
	start: number;
	/** Inkluzywny ostatni bajt (Content-Range: bytes start-end/total). */
	end: number;
	total: number;
}

export interface ForwardChunkResult {
	complete: boolean;
	/** Tylko przy `complete === true` — id wideo na YouTube + najlepsza miniatura. */
	video?: { id: string; thumbnailUrl: string };
}

/**
 * Forwarduje pojedynczy chunk do sesji resumable YouTube (Worker → YouTube,
 * server-to-server — przeglądarka nie może PUTować bezpośrednio: brak CORS).
 * - 308 Resume Incomplete → `{ complete: false }` (kolejny chunk).
 * - 200/201 → `{ complete: true, video }` (id + miniatura z zasobu wideo).
 */
export async function forwardChunk(
	accessToken: string,
	sessionUrl: string,
	range: ChunkRange,
	body: BodyInit,
	_config: YoutubeConfig,
	fetchFn: typeof fetch = fetch,
): Promise<ForwardChunkResult> {
	const init: RequestInit & { duplex?: "half" } = {
		method: "PUT",
		headers: {
			authorization: `Bearer ${accessToken}`,
			"content-range": `bytes ${range.start}-${range.end}/${range.total}`,
		},
		body,
		duplex: "half",
	};
	const res = await fetchFn(sessionUrl, init);

	if (res.status === 308) return { complete: false };
	if (!res.ok) throw youtubeError(res, "przesyłania fragmentu wideo");

	const data = (await res.json()) as {
		id?: string;
		snippet?: { thumbnails?: YoutubeThumbnails };
	};
	if (!data.id) {
		throw new AppError("YouTube: odpowiedź zakończenia uploadu nie zawiera id", "INTERNAL", 502);
	}
	return {
		complete: true,
		video: { id: data.id, thumbnailUrl: pickThumbnail(data.snippet ?? {}) },
	};
}
