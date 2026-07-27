// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useState } from "react";
import { type ChunkPlan, planChunks } from "./plan-chunks";

/** Rozmiar chunka uploadu — 16 MiB (dobry margines pod limit 100 MB Workera). */
export const VIDEO_CHUNK_SIZE_BYTES = 16 * 1024 * 1024;

/**
 * Cokolwiek z `size`, `type` i `slice(start,end)` — `File` / `Blob` to spełnia.
 * Interfejs (nie `File`) po to, by deep module był testowalny bez DOM.
 */
export interface Sliceable {
	size: number;
	type: string;
	slice(start: number, end: number): Blob;
}

export interface VideoUploadInput {
	file: Sliceable;
	title: string;
	description: string | null;
}

export interface VideoUploadDeps {
	/** Jedyna granica sieci — mockowana w testach, realny `fetch` w hooku. */
	fetchFn: typeof fetch;
	/** Wstrzykiwane dla testów; domyślnie `planChunks`. */
	planChunksFn?: (size: number, chunkSize: number) => ChunkPlan[];
	chunkSize?: number;
}

export interface VideoUploadProgress {
	uploadedBytes: number;
	totalBytes: number;
}

export interface UploadedVideo {
	/** Id rekordu w Neon (z `confirm`). */
	id: string;
	youtubeVideoId: string;
	thumbnailUrl: string;
}

async function errorMessage(res: Response): Promise<string> {
	try {
		const body = (await res.json()) as { error?: string };
		if (body.error) return body.error;
	} catch {
		/* odpowiedź nie jest JSON-em */
	}
	return `Błąd uploadu (${res.status})`;
}

/**
 * Pełny lifecycle uploadu wideo (deep module, testowalny bez Reacta):
 * 1. `POST /upload-session` — limit dzienny + start sesji resumable.
 * 2. `PUT /upload-chunk` per chunk (Worker proxy → YouTube), `onProgress` po każdym.
 * 3. `POST /confirm` — zapis rekordu w Neon z id z ostatniego chunka.
 *
 * Błąd na którymś kroku → rzucany (hook ustawia `error`).
 */
export async function runVideoUpload(
	input: VideoUploadInput,
	onProgress: (p: VideoUploadProgress) => void,
	deps: VideoUploadDeps,
): Promise<UploadedVideo> {
	const { fetchFn } = deps;
	const chunkSize = deps.chunkSize ?? VIDEO_CHUNK_SIZE_BYTES;
	const plan = (deps.planChunksFn ?? planChunks)(input.file.size, chunkSize);

	const sessionRes = await fetchFn("/api/video/upload-session", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			title: input.title,
			description: input.description,
			size: input.file.size,
			mime: input.file.type || "video/mp4",
		}),
	});
	if (!sessionRes.ok) throw new Error(await errorMessage(sessionRes));
	const { data: session } = (await sessionRes.json()) as { data: { sessionUrl: string } };

	let youtubeVideoId = "";
	let thumbnailUrl = "";
	let uploadedBytes = 0;

	for (const chunk of plan) {
		const chunkRes = await fetchFn("/api/video/upload-chunk", {
			method: "PUT",
			headers: {
				"content-range": `bytes ${chunk.start}-${chunk.end}/${chunk.total}`,
				"x-upload-session": session.sessionUrl,
			},
			body: input.file.slice(chunk.start, chunk.end + 1),
			duplex: "half",
		} as RequestInit);
		if (!chunkRes.ok) throw new Error(await errorMessage(chunkRes));

		const { data: chunkData } = (await chunkRes.json()) as {
			data: { complete: boolean; video?: { id: string; thumbnailUrl: string } };
		};
		uploadedBytes += chunk.end - chunk.start + 1;
		onProgress({ uploadedBytes, totalBytes: input.file.size });

		if (chunkData.complete && chunkData.video) {
			youtubeVideoId = chunkData.video.id;
			thumbnailUrl = chunkData.video.thumbnailUrl;
		}
	}

	if (!youtubeVideoId) throw new Error("Upload zakończony bez id wideo");

	const confirmRes = await fetchFn("/api/video/confirm", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			youtubeVideoId,
			title: input.title,
			description: input.description,
			thumbnailUrl,
		}),
	});
	if (!confirmRes.ok) throw new Error(await errorMessage(confirmRes));
	const { data: video } = (await confirmRes.json()) as { data: { id: string } };

	return { id: video.id, youtubeVideoId, thumbnailUrl };
}

export interface UseVideoUploadResult {
	upload: (input: VideoUploadInput) => Promise<UploadedVideo>;
	isPending: boolean;
	/** Postęp 0-100 %, lub null gdy bezczynny. */
	progress: number | null;
	error: Error | null;
	result: UploadedVideo | null;
	reset: () => void;
}

/** Hook-właściciel uploadu: stan `isPending`/`progress`/`error`/`result`, realny `fetch`. */
export function useVideoUpload(): UseVideoUploadResult {
	const [isPending, setIsPending] = useState(false);
	const [progress, setProgress] = useState<number | null>(null);
	const [error, setError] = useState<Error | null>(null);
	const [result, setResult] = useState<UploadedVideo | null>(null);

	const upload = useCallback(async (input: VideoUploadInput): Promise<UploadedVideo> => {
		setError(null);
		setResult(null);
		setIsPending(true);
		setProgress(0);
		try {
			const video = await runVideoUpload(
				input,
				(p) =>
					setProgress(p.totalBytes === 0 ? 0 : Math.round((p.uploadedBytes / p.totalBytes) * 100)),
				{ fetchFn: fetch },
			);
			setResult(video);
			setProgress(100);
			return video;
		} catch (e) {
			setError(e instanceof Error ? e : new Error(String(e)));
			throw e;
		} finally {
			setIsPending(false);
		}
	}, []);

	return {
		upload,
		isPending,
		progress,
		error,
		result,
		reset: () => {
			setError(null);
			setResult(null);
			setProgress(null);
			setIsPending(false);
		},
	};
}
