// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CommentSection, commentsQueryOptions } from "@/components/app/comment-section";
import { POST_VIEW_STAGES, PostView } from "@/components/app/post-view";
import { useBootSequence } from "@/core/boot-sequence";

function useIsDesktop() {
	const [isDesktop, setIsDesktop] = useState(false);
	useEffect(() => {
		if (!window.matchMedia) return;
		const mql = window.matchMedia("(min-width: 1024px)");
		setIsDesktop(mql.matches);
		const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, []);
	return isDesktop;
}

interface PostResponse {
	data: unknown;
	meta: { imageAccountHash: string };
}

async function fetchPost(id: string): Promise<PostResponse | null> {
	const res = await fetch(`/api/app/posts/${id}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error("Nie udało się pobrać posta");
	return res.json() as Promise<PostResponse>;
}

export const Route = createFileRoute("/app/post/$id")({
	component: PostPage,
});

function PostPage() {
	const { id } = Route.useParams();
	const { session, featureFlags } = Route.useRouteContext();
	const navigate = useNavigate();
	const isDesktop = useIsDesktop();
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const { data: response, isLoading } = useQuery({
		queryKey: ["posts", id],
		queryFn: () => fetchPost(id),
	});

	// Choreografia #147: photos → comments → text. Komentarze pobierane RÓWNOLEGLE
	// z postem (ten sam klucz co CommentSection — jeden fetch), gotowość = koniec
	// pending (sukces lub błąd). Etap photos odblokowuje wygaszenie PIERWSZEGO
	// zdjęcia (post bez zdjęć → od razu) — dalsze fade'ują niezależnie.
	const commentsQuery = useQuery(commentsQueryOptions(id));
	// Bramka zapamiętana per id posta — nawigacja do innego posta wraca do czekania.
	const [firstImageLoadedFor, setFirstImageLoadedFor] = useState<string | null>(null);

	const postData = response?.data as { images?: unknown[] } | undefined;
	const visible = useBootSequence(POST_VIEW_STAGES, {
		photos: !postData || (postData.images?.length ?? 0) === 0 || firstImageLoadedFor === id,
		comments: !commentsQuery.isPending,
		text: true,
	});
	const handleFirstImageLoad = () => setFirstImageLoadedFor(id);

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

	const commentSection = (
		<div id="comments">
			<CommentSection
				postId={id}
				currentUserId={session.userId}
				currentUserRole={session.role}
				reveal={visible.comments}
			/>
		</div>
	);

	return (
		<div className="bg-background">
			{!lightboxOpen && (
				<div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
					<div className="mx-auto flex max-w-5xl items-center justify-between">
						<Link
							to="/app"
							className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
						>
							&larr; Wróć do feedu
						</Link>
					</div>
				</div>
			)}

			{isDesktop ? (
				<div className="mx-auto max-w-5xl px-4 py-6">
					<div style={{ display: "flex", gap: "1.5rem" }}>
						<div
							style={{
								flex: "3",
								minWidth: 0,
								position: "sticky",
								top: "4rem",
								alignSelf: "flex-start",
								maxHeight: "calc(100vh - 5rem)",
								overflowY: "auto",
							}}
						>
							<PostView
								post={response.data as never}
								imageAccountHash={response.meta.imageAccountHash}
								currentUserId={session.userId}
								currentUserRole={session.role}
								onDeleted={() => navigate({ to: "/app" })}
								onLightboxChange={setLightboxOpen}
								libraryEnabled={featureFlags.library}
								revealText={visible.text}
								onFirstImageLoad={handleFirstImageLoad}
							/>
						</div>
						<div style={{ flex: "2", minWidth: 0 }}>{commentSection}</div>
					</div>
				</div>
			) : (
				<div className="mx-auto max-w-2xl px-4 py-4 pb-50">
					{commentSection}
					<hr className="my-4 border-border" />
					<PostView
						post={response.data as never}
						imageAccountHash={response.meta.imageAccountHash}
						currentUserId={session.userId}
						currentUserRole={session.role}
						onDeleted={() => navigate({ to: "/app" })}
						onLightboxChange={setLightboxOpen}
						libraryEnabled={featureFlags.library}
						revealText={visible.text}
						onFirstImageLoad={handleFirstImageLoad}
					/>
				</div>
			)}
		</div>
	);
}
