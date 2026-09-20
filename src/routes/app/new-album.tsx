// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
	type AlbumVideoProgress,
	NewAlbumForm,
	type NewAlbumSubmitData,
} from "@/components/app/new-album-form";
import { UploadErrorAlert } from "@/components/app/upload-error-alert";
import { runVideoUpload, VideoUploadHttpError } from "@/components/video/use-video-upload";
import { uploadImages } from "@/images/upload";

export const Route = createFileRoute("/app/new-album")({
	component: NewAlbumPage,
});

/**
 * POST JSON → sparsowany JSON albo Error z komunikatem serwera (wzorzec
 * #135: przyczyna z API trafia do klienta zamiast ogólnika).
 */
async function postAlbumApi<T>(url: string, body: unknown, failureMessage: string): Promise<T> {
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const parsed = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new Error(parsed?.error ?? failureMessage);
	}
	return (await res.json()) as T;
}

/**
 * Wideo → YouTube SEKWENCYJNIE (kolejność = kolejność na liście), z postępem
 * „Wideo i/N — x%". 503 z upload-session = YouTube niepołączony → czytelny
 * polski komunikat. Zwraca youtubeVideoId w kolejności wgrywania.
 */
async function uploadAlbumVideos(
	input: NewAlbumSubmitData,
	setUploadProgress: (progress: AlbumVideoProgress | null) => void,
): Promise<string[]> {
	const videoIds: string[] = [];
	for (const [index, video] of input.pendingVideos.entries()) {
		setUploadProgress({ videoIndex: index, total: input.pendingVideos.length, percent: 0 });
		try {
			const uploaded = await runVideoUpload(
				{ file: video.file, title: video.title, description: null },
				(p) => {
					const percent =
						p.totalBytes === 0 ? 0 : Math.round((p.uploadedBytes / p.totalBytes) * 100);
					setUploadProgress({
						videoIndex: index,
						total: input.pendingVideos.length,
						percent,
					});
				},
				{ fetchFn: fetch },
			);
			videoIds.push(uploaded.youtubeVideoId);
		} catch (e) {
			if (e instanceof VideoUploadHttpError && e.status === 503) {
				throw new Error("Podłącz YouTube w panelu admina, aby wgrywać wideo.");
			}
			throw e;
		}
	}
	return videoIds;
}

/**
 * Reviza #187: tworzenie albumu jako podstrona (zamiast dialogu) — flow
 * publikacji: (1) wideo → YouTube SEKWENCYJNIE (postęp „Wideo 1/N — x%"),
 * (2) zdjęcia → CF Images, (3) POST /api/app/albums, (4) wideo → album_items
 * (kind=video), (5) invalidacja listy + nawigacja do /app/albums. 503 z
 * upload-session = YouTube niepołączony → czytelny polski komunikat.
 */
function NewAlbumPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [uploadProgress, setUploadProgress] = useState<AlbumVideoProgress | null>(null);
	const [isError, setIsError] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	// Ostatni input do ponowienia z Alertu (wzorzec /app/new, issue #135).
	const lastInputRef = useRef<NewAlbumSubmitData | null>(null);

	async function publishAlbum(input: NewAlbumSubmitData) {
		lastInputRef.current = input;
		setError(null);
		setIsSubmitting(true);
		try {
			// 1. Wideo → YouTube (sekwencyjnie, postęp per wideo).
			const videoIds = await uploadAlbumVideos(input, setUploadProgress);
			setUploadProgress(null);

			// 2. Zdjęcia → CF Images.
			const photoIds = input.files.length > 0 ? await uploadImages(input.files) : [];

			// 3. Utworzenie albumu + 4. wideo → album_items (kind=video).
			const album = await postAlbumApi<{ data: { id: string; title: string } }>(
				"/api/app/albums",
				{ title: input.title, photoIds },
				"Nie udało się utworzyć albumu",
			);
			if (videoIds.length > 0) {
				await postAlbumApi(
					`/api/app/albums/${album.data.id}/items`,
					{ kind: "video", refs: videoIds },
					"Nie udało się dodać wideo do albumu",
				);
			}

			// 5. Odświeżenie listy + powrót do albumów.
			queryClient.invalidateQueries({ queryKey: ["albums"] });
			await navigate({ to: "/app/albums" });
		} catch (e) {
			setError(e instanceof Error ? e : new Error(String(e)));
			setIsError(true);
			setIsSubmitting(false);
			setUploadProgress(null);
		}
	}

	return (
		<div className="max-w-2xl bg-background px-4 py-6 pb-50 sm:pb-6">
			<UploadErrorAlert
				error={isError ? error : null}
				onRetry={async () => {
					const input = lastInputRef.current;
					if (input) await publishAlbum(input);
				}}
				retryDisabled={isSubmitting}
			/>
			<NewAlbumForm
				onSubmit={publishAlbum}
				isSubmitting={isSubmitting}
				uploadProgress={uploadProgress}
				onBack={() => navigate({ to: "/app/albums" })}
			/>
		</div>
	);
}
