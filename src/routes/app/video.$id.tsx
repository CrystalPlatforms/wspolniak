// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { VideoActions } from "@/components/video/video-actions";
import { YouTubePlayer } from "@/components/video/youtube-player";
import type { VideoFeedItem } from "@/db/videos";

interface VideoResponse {
	data: VideoFeedItem | null;
}

async function fetchVideo(id: string): Promise<VideoResponse | null> {
	const res = await fetch(`/api/app/videos/${id}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error("Nie udało się pobrać wideo");
	return res.json() as Promise<VideoResponse>;
}

export const Route = createFileRoute("/app/video/$id")({
	component: VideoPage,
});

function VideoPage() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const { session } = Route.useRouteContext();
	const { data: response, isLoading } = useQuery({
		queryKey: ["videos", id],
		queryFn: () => fetchVideo(id),
	});

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<p className="text-muted-foreground">Ładowanie...</p>
			</div>
		);
	}

	const video = response?.data ?? null;
	const createdAt = video ? new Date(video.createdAt) : null;

	return (
		<div className="bg-background">
			<div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
				<div className="mx-auto flex max-w-4xl items-center">
					<button
						type="button"
						onClick={() => navigate({ to: "/app/video" })}
						className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
					>
						<ArrowLeft className="h-4 w-4" />
						Wróć do wideo
					</button>
					<div className="flex-1" />
					{video && (session.userId === video.authorId || session.role === "admin") && (
						<VideoActions videoId={video.id} />
					)}
				</div>
			</div>

			<div className="mx-auto max-w-4xl px-4 py-6 pb-28 sm:pb-6">
				{!video ? (
					<p className="py-12 text-center text-muted-foreground">Wideo nie zostało znalezione</p>
				) : (
					<div className="space-y-4">
						<YouTubePlayer youtubeVideoId={video.youtubeVideoId} title={video.title} />
						<div>
							<h1 className="text-xl font-bold text-foreground">{video.title}</h1>
							<div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
								<span>{video.author.name}</span>
								<span aria-hidden="true">·</span>
								<time dateTime={createdAt?.toISOString()}>
									{createdAt?.toLocaleDateString("pl-PL", {
										day: "numeric",
										month: "long",
										year: "numeric",
									})}
								</time>
							</div>
						</div>
						{video.description ? (
							<p className="whitespace-pre-line text-foreground">{video.description}</p>
						) : null}
					</div>
				)}
			</div>
		</div>
	);
}
