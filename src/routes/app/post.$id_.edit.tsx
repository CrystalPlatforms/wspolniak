// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { EditPostForm } from "@/components/app/edit-post-form";
import type { Mention } from "@/components/app/mention-input";
import { UploadErrorAlert } from "@/components/app/upload-error-alert";
import {
	uploadPostFilesForCreate,
	uploadVideoPlan,
	type VideoPlanEntry,
	type VideoPublishProgress,
} from "@/components/app/use-publish-post";
import { Skeleton } from "@/components/ui/skeleton";
import type { PostVideoEntry } from "@/db/posts/schema";
import { type ImageUploadProgress, uploadImages } from "@/images/upload";

interface PostImage {
	id: string;
	cfImageId: string;
	displayOrder: number;
}

interface PostData {
	id: string;
	authorId: string;
	description: string | null;
	images: PostImage[];
	/** Video v2 (#194): wideo osadzone w poście (JSONB). */
	videos: PostVideoEntry[];
	/** Ankieta posta (#241) — w edycji tylko do czytania. */
	poll?: { question: string; options: string[] } | null;
	/** Lokalizacja posta (#242). */
	location?: { lat: number; lng: number; label?: string } | null;
	/** Załączniki posta (#243) — z kluczami do re-attachu przy edycji. */
	files?: { id: string; key: string; name: string; size: number; mimeType: string }[];
}

interface PostResponse {
	data: PostData;
	meta: { imageAccountHash: string };
}

async function fetchPost(id: string): Promise<PostResponse | null> {
	const res = await fetch(`/api/app/posts/${id}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error("Nie udało się pobrać posta");
	return res.json() as Promise<PostResponse>;
}

/** YouTube delete dokładnie raz — fire-and-forget, błąd nigdy nie blokuje zapisu (#197). */
async function deleteFromYoutube(youtubeVideoId: string): Promise<void> {
	await fetch("/api/video/yt-delete", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ youtubeVideoId }),
	}).catch(() => {
		// Nieudane "zapalenie" delete nie blokuje zapisu — serwer loguje własne próby.
	});
}

interface EditSubmitInput {
	description: string;
	files: File[];
	removedImageIds: string[];
	imageOrder: string[];
	videoPlan: VideoPlanEntry[];
	mentions: Mention[];
	/** Lokalizacja (#242): obiekt = ustaw, null = usuń, undefined = bez zmian. */
	location?: { lat: number; lng: number; label?: string } | null;
	/** Pliki (#243): metadane zostawionych istniejących + nowe pliki do uploadu. */
	keptFiles: { key: string; name: string; size: number; mimeType: string }[];
	newPostFiles: File[];
	/** Ktoś ruszył listę plików — wtedy PATCH wysyła pełną listę `files`. */
	filesDirty: boolean;
}

/** Helper PATCH-a z JSON-em — jeden kształt błędu dla wszystkich kroków zapisu. */
async function patchPost(
	id: string,
	body: Record<string, unknown>,
	errorMessage: string,
): Promise<void> {
	const res = await fetch(`/api/app/posts/${id}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (res.status === 403) throw new Error("Brak uprawnień do edycji tego posta");
	if (!res.ok) throw new Error(errorMessage);
}

export const Route = createFileRoute("/app/post/$id_/edit")({
	component: EditPostPage,
});

function EditPostPage() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const { data: response, isLoading } = useQuery({
		queryKey: ["posts", id],
		queryFn: () => fetchPost(id),
	});

	// Postęp wgrywania na przycisku „Zapisz zmiany" — jak przy publikacji (#251).
	// Zapis edycji NIE czeka na pełny pasek: wraca do posta od razu po zapisie.
	const [uploadProgress, setUploadProgress] = useState<VideoPublishProgress | null>(null);
	const [imageProgress, setImageProgress] = useState<ImageUploadProgress | null>(null);
	const [isSlowUpload, setIsSlowUpload] = useState(false);
	const resetProgress = useCallback(() => {
		setUploadProgress(null);
		setImageProgress(null);
		setIsSlowUpload(false);
	}, []);

	const mutation = useMutation({
		mutationFn: async (input: EditSubmitInput) => {
			// Delete removed images
			await Promise.all(
				input.removedImageIds.map((imageId) =>
					fetch(`/api/app/posts/${id}/images/${imageId}`, { method: "DELETE" }),
				),
			);

			// Upload new files (wspólny pipeline #135: kompresja, batch URL-i)
			if (input.files.length > 0) {
				const cfImageIds = await uploadImages(input.files, {
					onProgress: setImageProgress,
					onSlowLink: () => setIsSlowUpload(true),
				});
				await patchPost(id, { cfImageIds }, "Nie udało się dodać zdjęć");
				// Zdjęcia gotowe — przycisk pokazuje potem już tylko postęp wideo.
				setImageProgress(null);
			}

			if (input.imageOrder.length > 0) {
				await patchPost(
					id,
					{ imageOrder: input.imageOrder },
					"Nie udało się zmienić kolejności zdjęć",
				);
			}

			// Pliki (#243): nowe idą do R2 (helper z publish flow), potem pełna
			// lista metadanych (zostawione + nowe) leci w PATCH — sync po kluczach.
			const uploadedNew = await uploadPostFilesForCreate(input.newPostFiles);
			const fileMetas = [...input.keptFiles, ...uploadedNew];

			// Video v2 F3 (#197): najpierw wgrywa pending wideo z planu, potem zapis
			// payloadu z finalną kolejnością + lokalizacją i plikami (#242, #243).
			const videos = await uploadVideoPlan(input.videoPlan, setUploadProgress);
			await patchPost(
				id,
				{
					description: input.description || null,
					mentions: input.mentions,
					videos,
					location: input.location,
					...(input.filesDirty ? { files: fileMetas } : {}),
				},
				"Nie udało się edytować posta",
			);
			return null;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["posts"] });
			await queryClient.invalidateQueries({ queryKey: ["posts", id] });
			navigate({ to: "/app/post/$id", params: { id } });
		},
		onError: resetProgress,
	});

	const handleSubmit = useCallback(
		(data: EditSubmitInput) => {
			mutation.reset();
			resetProgress();
			mutation.mutate(data);
		},
		[mutation, resetProgress],
	);

	const handleVideoDelete = useCallback((youtubeVideoId: string) => {
		void deleteFromYoutube(youtubeVideoId);
	}, []);

	if (isLoading) {
		return (
			<div className="min-h-screen bg-background p-4" aria-busy="true">
				<div className="max-w-2xl space-y-4 pt-6">
					<Skeleton className="h-6 w-36" />
					<Skeleton className="h-24 w-full rounded-lg" />
					<Skeleton className="h-11 w-full rounded-md" />
					<Skeleton className="h-11 w-full rounded-md" />
				</div>
			</div>
		);
	}

	if (!response?.data) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<p className="text-muted-foreground">Post nie został znaleziony</p>
			</div>
		);
	}

	const post = response.data;

	return (
		<div className="max-w-2xl bg-background px-4 py-6 pb-50 sm:pb-6">
			{mutation.isError && (
				<UploadErrorAlert
					error={mutation.error}
					// Ręczne ponowienie (issue #135): react-query trzyma ostatnie
					// `variables`, więc retry odtwarza dokładnie ten sam zapis.
					onRetry={() => {
						const last = mutation.variables;
						if (!last) return;
						mutation.reset();
						resetProgress();
						mutation.mutate(last);
					}}
					retryDisabled={mutation.isPending}
				/>
			)}

			<EditPostForm
				postId={post.id}
				description={post.description}
				existingImages={post.images.map((img) => ({ id: img.id, cfImageId: img.cfImageId }))}
				imageAccountHash={response.meta.imageAccountHash}
				initialPoll={post.poll ?? null}
				initialLocation={post.location ?? null}
				initialFiles={post.files ?? []}
				initialVideos={post.videos}
				onSubmit={handleSubmit}
				onVideoDelete={handleVideoDelete}
				isSubmitting={mutation.isPending}
				uploadProgress={uploadProgress}
				imageProgress={imageProgress}
				isSlowUpload={isSlowUpload}
				onBack={() => navigate({ to: "/app/post/$id", params: { id } })}
			/>
		</div>
	);
}
