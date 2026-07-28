// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MarkdownText } from "@/components/app/markdown-text";

interface PostImage {
	id: string;
	postId: string;
	cfImageId: string;
	displayOrder: number;
	createdAt: string;
}

interface PostData {
	id: string;
	authorId: string;
	description: string | null;
	createdAt: string;
	updatedAt: string;
	author: { id: string; name: string };
	images: PostImage[];
}

interface PostResponse {
	data: PostData;
	meta: { imageAccountHash: string };
}

async function fetchSharedPost(id: string): Promise<PostResponse | null> {
	const res = await fetch(`/api/public/posts/${id}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error("Nie udało się pobrać posta");
	return res.json() as Promise<PostResponse>;
}

export const Route = createFileRoute("/shared-post/$id")({
	component: SharedPostPage,
});

function SharedPostPage() {
	const { id } = Route.useParams();
	const { data: response, isLoading } = useQuery({
		queryKey: ["shared-posts", id],
		queryFn: () => fetchSharedPost(id),
	});

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
		<div className="min-h-screen bg-background">
			<div className="mx-auto max-w-2xl px-4 py-8">
				<article className="space-y-4">
					<div className="flex items-center gap-2">
						<span className="font-semibold text-foreground">{post.author.name}</span>
						<time className="text-sm text-muted-foreground" dateTime={post.createdAt}>
							{new Date(post.createdAt).toLocaleDateString("pl-PL", {
								day: "numeric",
								month: "long",
								year: "numeric",
								hour: "2-digit",
								minute: "2-digit",
							})}
						</time>
					</div>

					{post.description && (
						<MarkdownText text={post.description} className="break-words text-foreground" />
					)}

					{post.images.length > 0 && (
						<div className="space-y-2">
							{post.images.map((image) => {
								const src = `https://imagedelivery.net/${response.meta.imageAccountHash}/${image.cfImageId}/public`;
								return (
									<div key={image.id}>
										<img
											src={src}
											alt={`Zdjęcie ${image.displayOrder + 1}`}
											className="w-full rounded-lg"
											loading="lazy"
										/>
									</div>
								);
							})}
						</div>
					)}
				</article>

				<div className="mt-8 text-center">
					<p className="text-sm text-muted-foreground">
						Udostępnione przez <strong className="text-foreground">{post.author.name}</strong>
					</p>
				</div>
			</div>
		</div>
	);
}
