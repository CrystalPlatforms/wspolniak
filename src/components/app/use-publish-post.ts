// SPDX-License-Identifier: AGPL-3.0-or-later

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { feedQueryKey } from "@/components/app/feed-query";
import type { Mention } from "@/components/app/mention-input";
import { runVideoUpload, VideoUploadHttpError } from "@/components/video/use-video-upload";
import type { PostVideoEntry } from "@/db/posts";
import { UploadFlowError, uploadFetch, uploadImages } from "@/images/upload";

/** Wideo oczekujące na upload przy publikacji (z kompozytora). */
export interface PublishVideoInput {
	file: File;
	title: string;
}

/** Wejście publikacji posta (tekst + pliki + wideo + wzmianki). */
export interface PublishPostInput {
	description: string | null;
	files: File[];
	pendingVideos: PublishVideoInput[];
	mentions: Mention[];
}

/** Postęp wgrywania wideo przy publikacji — label „Wideo 1/2 — 45%". */
export interface VideoPublishProgress {
	videoIndex: number;
	total: number;
	percent: number;
}

/**
 * Czas wypełniania paska postępu (ms). MUSI zgadzać się z animacją `7s` klasy
 * `animate-[publish-indeterminate_7s_ease-out_forwards]` w `new-post-form.tsx`.
 * Pasek ma dojść do 100% zanim nawigujemy do feedu.
 */
export const PUBLISH_BAR_DURATION_MS = 7000;

export interface RunPublishFlowOptions {
	input: PublishPostInput;
	navigate: (opts: { to: string; search?: Record<string, unknown> }) => Promise<void> | void;
	queryClient: QueryClient;
	/** Moment startu (Date.now(), ms) — do obliczenia ile brakuje do pełnego paska. */
	startedAt: number;
	/** Postęp uploadu wideo („Wideo 1/2 — 45%") — do labelu przycisku. */
	onUploadProgress?: (p: VideoPublishProgress) => void;
	/** Jedyna granica sieci — mockowana w testach, realna w hooku usePublishPost. */
	createPostFn?: (input: PublishPostInput) => Promise<unknown>;
	/** Granica uploadu wideo (session → chunks → confirm) — mockowana w testach. */
	uploadVideoFn?: typeof runVideoUpload;
}

/**
 * YouTube niepołączony (upload-session → 503): UI zamienia picker na instrukcję
 * admina zamiast ogólnego błędu publikacji (us story 7, #194).
 */
export class VideoNotConnectedError extends Error {
	constructor() {
		super("Podłącz YouTube w panelu admina");
		this.name = "VideoNotConnectedError";
	}
}

/**
 * Element planu wideo — `existing` idzie 1:1 (round-trip), `pending` zostaje
 * wgryty przed zapisem. Kolejność planu = kolejność odtwarzania w poście (F3).
 */
export type VideoPlanEntry =
	| { kind: "existing"; entry: PostVideoEntry }
	| { kind: "pending"; file: File; title: string };

/**
 * Realizuje plan wideo: wgrywa wpisy `pending` SEKWENCYJNIE (postęp per wideo),
 * `existing` przepuszcza 1:1. Zwraca wpisy `videos` w kolejności planu.
 * 503 z upload-session = YouTube niepołączony → VideoNotConnectedError.
 */
export async function uploadVideoPlan(
	plan: VideoPlanEntry[],
	onProgress: (p: VideoPublishProgress) => void,
	uploadVideoFn?: typeof runVideoUpload,
): Promise<PostVideoEntry[]> {
	const upload = uploadVideoFn ?? runVideoUpload;
	const entries: PostVideoEntry[] = [];
	for (const [index, item] of plan.entries()) {
		if (item.kind === "existing") {
			entries.push(item.entry);
			continue;
		}
		// Progress 0% od razu na start wideo — UI pokazuje „Wgrywanie wideo i/N"
		// zanim pierwszy chunk (do 16 MiB) dotrze przez proxy do YouTube.
		onProgress({ videoIndex: index, total: plan.length, percent: 0 });
		try {
			const uploaded = await upload(
				{ file: item.file, title: item.title, description: null },
				(p) => {
					const percent =
						p.totalBytes === 0 ? 0 : Math.round((p.uploadedBytes / p.totalBytes) * 100);
					onProgress({ videoIndex: index, total: plan.length, percent });
				},
				{ fetchFn: fetch },
			);
			entries.push({
				youtubeVideoId: uploaded.youtubeVideoId,
				title: item.title,
				thumbnailUrl: uploaded.thumbnailUrl,
			});
		} catch (e) {
			if (e instanceof VideoUploadHttpError && e.status === 503) {
				throw new VideoNotConnectedError();
			}
			throw e;
		}
	}
	return entries;
}

/**
 * Wgrywa pending wideo SEKWENCYJNIE (kolejność = kolejność odtwarzania) i zwraca
 * wpisy `videos` do osadzenia w poście. 503 z upload-session = YouTube
 * niepołączony → VideoNotConnectedError.
 */
async function uploadPendingVideos(
	videos: PublishVideoInput[],
	onProgress: (p: VideoPublishProgress) => void,
	uploadVideoFn?: typeof runVideoUpload,
): Promise<PostVideoEntry[]> {
	return uploadVideoPlan(
		videos.map((v) => ({ kind: "pending" as const, file: v.file, title: v.title })),
		onProgress,
		uploadVideoFn,
	);
}

/**
 * Pełny lifecycle publikacji (deep module, testowalny bez Reacta):
 * 1. `createPost` (upload zdjęć + create) — jedyna granica sieci.
 * 2. `refetchQueries` feedu — post musi być w cache, żeby po nawigacji był widoczny od razu.
 * 3. odczekanie do pełnego wypełnienia paska (`PUBLISH_BAR_DURATION_MS` od `startedAt`).
 * 4. `navigate` do `/app`.
 *
 * Błąd na którymokolwiek kroku → rzucany (formularz zostaje z tekstem/zdjęciami, error → Alert).
 */
export async function runPublishFlow(options: RunPublishFlowOptions): Promise<void> {
	const create = options.createPostFn ?? createPost;
	const videoEntries = await uploadPendingVideos(
		options.input.pendingVideos,
		options.onUploadProgress ?? (() => {}),
		options.uploadVideoFn,
	);
	await create({
		...options.input,
		videos: videoEntries,
	});
	await options.queryClient.refetchQueries({ queryKey: feedQueryKey });
	const remaining = PUBLISH_BAR_DURATION_MS - (Date.now() - options.startedAt);
	if (remaining > 0) {
		await new Promise((resolve) => setTimeout(resolve, remaining));
	}
	await options.navigate({
		to: "/app",
		...(options.input.pendingVideos.length > 0 ? { search: { videoPublished: true } } : {}),
	});
}

/**
 * Realna funkcja create (granica sieci): kompresuje + uploaduje zdjęcia i tworzy post.
 *
 * Zdjęcia idą przez `uploadImages` (issue #135: batch upload-urls, kompresja w workerze,
 * równoległy upload, twardy timeout 7 s i jasne błędy zamiast "Load failed").
 * `cfImageId` zachowują kolejność plików.
 */
export async function createPost(input: PublishPostInput & { videos?: unknown }): Promise<unknown> {
	const cfImageIds = input.files.length > 0 ? await uploadImages(input.files) : [];

	const res = await uploadFetch(
		"/api/app/posts",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				description: input.description || null,
				cfImageIds,
				videos: input.videos ?? [],
				mentions: input.mentions,
			}),
		},
		"create-post",
	);

	if (res.status === 429) {
		throw new UploadFlowError(
			"create-post",
			"http",
			"Osiągnięto dzienny limit postów (50)",
			"HTTP 429",
		);
	}
	if (!res.ok) {
		// Serwer mówi konkretnie CZEMU odrzucił (np. "Validation failed" + pole) —
		// przepuszczamy jego przyczynę do komunikatu/szczegółów (issue #135).
		const body = (await res.json().catch(() => null)) as {
			error?: string;
			details?: { fieldErrors?: Record<string, string[]> };
		} | null;
		const fieldErrors = body?.details?.fieldErrors ?? {};
		const fieldsText = Object.entries(fieldErrors)
			.map(([field, errors]) => `${field}: ${(errors ?? []).join(", ")}`)
			.join("; ");
		const detail = [`HTTP ${res.status}`, body?.error, fieldsText].filter(Boolean).join(" — ");

		// Znane przypadki walidacji tłumaczymy na konkretny polski komunikat.
		let message = "Nie udało się utworzyć posta";
		if (fieldErrors.description?.some((e) => e.includes("2000"))) {
			message = `Tekst posta jest za długi — limit to 2000 znaków (wpisanych: ${input.description?.length ?? "?"})`;
		}

		throw new UploadFlowError("create-post", "http", message, detail);
	}

	return res.json();
}

export interface UsePublishPostResult {
	publish: (input: PublishPostInput) => Promise<void>;
	isPending: boolean;
	/** Postęp uploadu wideo („Wideo 1/2 — 45%") — null gdy poza fazą uploadu. */
	uploadProgress: VideoPublishProgress | null;
	isError: boolean;
	error: Error | null;
	reset: () => void;
}

/**
 * Hook (deep module) właściciel publishowania. `isPending` zostaje true przez CAŁY flow
 * (upload wideo → create → refetch → odczekanie paska → navigate), więc pasek jest
 * widoczny aż do pełna i znika dopiero przy nawigacji. Przy błędzie `isPending=false`,
 * `error` ustawione.
 */
export function usePublishPost(): UsePublishPostResult {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [isPending, setIsPending] = useState(false);
	const [uploadProgress, setUploadProgress] = useState<VideoPublishProgress | null>(null);
	const [error, setError] = useState<Error | null>(null);

	const publish = useCallback(
		async (input: PublishPostInput) => {
			setError(null);
			setUploadProgress(null);
			setIsPending(true);
			try {
				await runPublishFlow({
					input,
					navigate,
					queryClient,
					startedAt: Date.now(),
					onUploadProgress: setUploadProgress,
				});
				// sukces: navigate odpaliło się w runPublishFlow, komponent się odmontuje.
				// Celowo nie zerujemy isPending — pasek ma być pełny aż do samej nawigacji.
			} catch (e) {
				setError(e instanceof Error ? e : new Error(String(e)));
				setUploadProgress(null);
				setIsPending(false);
			}
		},
		[navigate, queryClient],
	);

	return {
		publish,
		isPending,
		uploadProgress,
		isError: error !== null,
		error,
		reset: () => {
			setError(null);
			setUploadProgress(null);
			setIsPending(false);
		},
	};
}
