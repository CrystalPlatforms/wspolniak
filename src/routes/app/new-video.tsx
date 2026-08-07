// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useVideoUpload } from "@/components/video/use-video-upload";
import { VideoProcessingNotice } from "@/components/video/video-processing-notice";
import { YouTubePlayer } from "@/components/video/youtube-player";

export const Route = createFileRoute("/app/new-video")({
	beforeLoad: ({ context }) => {
		if (!context.featureFlags.video) throw redirect({ to: "/app" });
	},
	component: NewVideoPage,
});

function NewVideoPage() {
	const navigate = useNavigate();
	const { upload, isPending, error, result, reset } = useVideoUpload();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [file, setFile] = useState<File | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!file || !title.trim() || isPending) return;
		try {
			await upload({ file, title: title.trim(), description: description.trim() || null });
		} catch {
			// błąd wylądował w `error` hooka — Alert poniżej
		}
	}

	function resetAll() {
		reset();
		setFile(null);
		setTitle("");
		setDescription("");
	}

	if (result) {
		return (
			<div className="max-w-2xl bg-background px-4 py-6 pb-28 sm:pb-6">
				<div className="mb-6 flex items-center gap-2">
					<button
						type="button"
						onClick={() => navigate({ to: "/app" })}
						className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
						title="Wróć do feeda"
					>
						<ArrowLeft className="h-5 w-5" />
					</button>
					<h1 className="text-2xl font-bold text-foreground">Wideo dodane</h1>
				</div>

				{/* Success view — odtwarzanie wideo inline (dowód pełnego pipeline'u). */}
				<YouTubePlayer youtubeVideoId={result.youtubeVideoId} title={title} />

				<VideoProcessingNotice />

				<div className="mt-4 flex flex-wrap gap-2">
					<Button onClick={resetAll}>Wrzuć kolejne</Button>
					<Button variant="outline" onClick={() => navigate({ to: "/app" })}>
						Wróć do feeda
					</Button>
					<Button variant="outline" onClick={() => navigate({ to: "/app/video" })}>
						Wróć do Wideo
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-2xl bg-background px-4 py-6 pb-28 sm:pb-6">
			<div className="mb-6 flex items-center gap-2">
				<button
					type="button"
					onClick={() => navigate({ to: "/app" })}
					className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
					title="Wróć do feeda"
				>
					<ArrowLeft className="h-5 w-5" />
				</button>
				<h1 className="text-2xl font-bold text-foreground">Nowe wideo</h1>
			</div>

			{error ? (
				<Alert variant="destructive" className="mb-4">
					<AlertDescription>{error.message}</AlertDescription>
				</Alert>
			) : null}

			<form onSubmit={handleSubmit} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="video-title">Tytuł</Label>
					<Input
						id="video-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						maxLength={100}
						placeholder="np. Wakacje nad morzem"
						disabled={isPending}
						required
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="video-description">Opis (opcjonalnie)</Label>
					<Textarea
						id="video-description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						maxLength={5000}
						rows={3}
						placeholder="Krótki opis filmu..."
						disabled={isPending}
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="video-file">Plik wideo</Label>
					<Input
						id="video-file"
						type="file"
						accept="video/*"
						onChange={(e) => setFile(e.target.files?.[0] ?? null)}
						disabled={isPending}
						required
					/>
					{file ? (
						<p className="text-xs text-muted-foreground">
							{file.name} — {Math.max(1, Math.round(file.size / 1024 / 1024))} MB
						</p>
					) : null}
				</div>

				<Button
					type="submit"
					className="relative h-11 w-full overflow-hidden sm:h-9"
					disabled={!file || !title.trim() || isPending}
				>
					{isPending ? (
						<span
							aria-hidden
							className="absolute inset-0 origin-left animate-[publish-indeterminate_7s_ease-out_forwards] bg-primary-foreground/20"
						/>
					) : null}
					<span className="relative">{isPending ? "Wgrywanie…" : "Wrzuć wideo"}</span>
				</Button>
			</form>
		</div>
	);
}
