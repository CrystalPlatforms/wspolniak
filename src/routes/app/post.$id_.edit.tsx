// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback } from "react";
import { EditPostForm } from "@/components/app/edit-post-form";
import type { Mention } from "@/components/app/mention-input";
import { UploadErrorAlert } from "@/components/app/upload-error-alert";
import { uploadImages } from "@/images/upload";

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
	videos: { id: string; position: number }[];
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

export const Route = createFileRoute("/app/post/$id_/edit")({
	component: EditPostPage,
});

function EditPostPage() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { featureFlags } = Route.useRouteContext();

	const { data: response, isLoading } = useQuery({
		queryKey: ["posts", id],
		queryFn: () => fetchPost(id),
	});

	const mutation = useMutation({
		mutationFn: async (input: {
			description: string;
			files: File[];
			removedImageIds: string[];
			imageOrder: string[];
			videoIds: string[];
			mentions: Mention[];
		}) => {
			// Delete removed images
			await Promise.all(
				input.removedImageIds.map((imageId) =>
					fetch(`/api/app/posts/${id}/images/${imageId}`, { method: "DELETE" }),
				),
			);

			// Upload new files
			if (input.files.length > 0) {
				// Wspólny pipeline uploadu (issue #135): batch URL-i, kompresja, twardy timeout,
				// jasne błędy zamiast "Load failed".
				const cfImageIds = await uploadImages(input.files);
				const res = await fetch(`/api/app/posts/${id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ cfImageIds }),
				});
				if (!res.ok) throw new Error("Nie udało się dodać zdjęć");
			}

			// Reorder images
			if (input.imageOrder.length > 0) {
				const res = await fetch(`/api/app/posts/${id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ imageOrder: input.imageOrder }),
				});
				if (!res.ok) throw new Error("Nie udało się zmienić kolejności zdjęć");
			}

			// Update description + mentions + videos in a single PATCH. The backend
			// runs setPostVideos(postId, videoIds) as a replace, so even an empty
			// array is sent — removing every video must persist (parity with creating).
			const res = await fetch(`/api/app/posts/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					description: input.description || null,
					mentions: input.mentions,
					videoIds: input.videoIds,
				}),
			});
			if (res.status === 403) throw new Error("Brak uprawnień do edycji tego posta");
			if (!res.ok) throw new Error("Nie udało się edytować posta");

			return res.json();
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["posts"] });
			await queryClient.invalidateQueries({ queryKey: ["posts", id] });
			navigate({ to: "/app/post/$id", params: { id } });
		},
	});

	const handleSubmit = useCallback(
		(data: {
			description: string;
			files: File[];
			removedImageIds: string[];
			imageOrder: string[];
			videoIds: string[];
			mentions: Mention[];
		}) => {
			mutation.reset();
			mutation.mutate(data);
		},
		[mutation],
	);

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<p className="text-muted-foreground">Ładowanie...</p>
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
		<div className="mx-auto max-w-lg bg-background px-4 py-6 pb-50 sm:pb-6">
			<div className="mb-6 flex items-center gap-4">
				<button
					type="button"
					onClick={() => navigate({ to: "/app/post/$id", params: { id } })}
					className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
					title="Wróć do posta"
				>
					<ArrowLeft className="h-5 w-5" />
				</button>
				<h1 className="text-2xl font-bold text-foreground">Edytuj post</h1>
			</div>

			{mutation.isError && (
				<UploadErrorAlert
					error={mutation.error}
					// Ręczne ponowienie (issue #135): react-query trzyma ostatnie
					// `variables`, więc retry odtwarza dokładnie ten sam zapis.
					onRetry={() => {
						const last = mutation.variables;
						if (!last) return;
						mutation.reset();
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
				initialVideoIds={[...post.videos]
					.sort((a, b) => a.position - b.position)
					.map((video) => video.id)}
				onSubmit={handleSubmit}
				isSubmitting={mutation.isPending}
				featureFlags={featureFlags}
			/>
		</div>
	);
}
