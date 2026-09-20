// SPDX-License-Identifier: AGPL-3.0-or-later
import { ArrowLeftIcon, ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { GradientAiButton } from "@/components/app/ai/gradient-ai-button";
import { ComposerVideoPicker, type PendingVideo } from "@/components/app/composer-video-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";

/** Postęp wgrywania wideo przy publikacji albumu — label „Wideo 1/2 — 45%". */
export interface AlbumVideoProgress {
	videoIndex: number;
	total: number;
	percent: number;
}

export interface NewAlbumSubmitData {
	title: string;
	files: File[];
	pendingVideos: { file: File; title: string }[];
}

interface NewAlbumFormProps {
	onSubmit: (data: NewAlbumSubmitData) => void;
	isSubmitting: boolean;
	uploadProgress?: AlbumVideoProgress | null;
	onBack?: () => void;
}

/**
 * Reviza #187: tworzenie albumu jako PODSTRONA zamiast dialogu — układ
 * wzorowany na kompozytorze posta (/app/new): nagłówek ze strzałką i parą
 * AL na wysokości tytułu, mniejszy input tytułu, przyciski wyboru plików
 * z ikonami, podglądy zdjęć i picker wideo (upload → YouTube). Bez
 * formatowania, bez wspomnień i bez „Popraw opis" — album ma tylko tytuł.
 */
export function NewAlbumForm({
	onSubmit,
	isSubmitting,
	uploadProgress = null,
	onBack,
}: NewAlbumFormProps) {
	const [title, setTitle] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [previews, setPreviews] = useState<string[]>([]);
	const [pendingVideos, setPendingVideos] = useState<PendingVideo[]>([]);
	const [error, setError] = useState<string | null>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);

	function handleFilesChange(fileList: FileList | null) {
		const incoming = Array.from(fileList ?? []);
		if (incoming.length === 0) return;
		const merged = [...files, ...incoming];
		setFiles(merged);
		setPreviews(merged.map((f) => URL.createObjectURL(f)));
		if (imageInputRef.current) imageInputRef.current.value = "";
	}

	function removePhoto(index: number) {
		const merged = files.filter((_, i) => i !== index);
		setFiles(merged);
		setPreviews(merged.map((f) => URL.createObjectURL(f)));
	}

	function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		if (title.trim().length === 0) {
			setError("Podaj tytuł albumu");
			return;
		}
		if (files.length === 0 && pendingVideos.length === 0) {
			setError("Dodaj co najmniej jedno zdjęcie albo wideo");
			return;
		}
		setError(null);
		onSubmit({
			title: title.trim(),
			files,
			pendingVideos: pendingVideos.map(({ file, title: videoTitle }) => ({
				file,
				title: videoTitle,
			})),
		});
	}

	const submitLabel = isSubmitting
		? uploadProgress
			? `Wgrywanie wideo ${uploadProgress.videoIndex + 1}/${uploadProgress.total} — ${uploadProgress.percent}%`
			: "Tworzenie..."
		: "Utwórz";

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="mb-2 flex items-center gap-4">
				{onBack && (
					<button
						type="button"
						onClick={onBack}
						className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
						title="Wróć do albumów"
					>
						<ArrowLeftIcon className="h-5 w-5" />
					</button>
				)}
				<h1 className="text-2xl font-bold text-foreground">Nowy album</h1>
				<div className="ml-auto">
					<GradientAiButton target="album-title" files={files} onResult={setTitle} />
				</div>
			</div>

			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<div className="space-y-2">
				<Label htmlFor="album-title">Tytuł</Label>
				<Input
					id="album-title"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="np. Wakacje 2026"
					maxLength={100}
				/>
			</div>

			<div>
				<input
					ref={imageInputRef}
					type="file"
					accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
					multiple
					onChange={(e) => handleFilesChange(e.target.files)}
					className="hidden"
				/>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
					<Button
						type="button"
						variant="outline"
						className="h-11 w-full sm:h-9"
						onClick={() => imageInputRef.current?.click()}
						title={files.length > 0 ? `${files.length} zdjęć` : "Dodaj zdjęcia"}
					>
						<ImagePlus className="h-5 w-5" />
						Dodaj zdjęcia {files.length > 0 ? `(${files.length})` : ""}
					</Button>
					<ComposerVideoPicker videos={pendingVideos} onChange={setPendingVideos} />
				</div>

				{previews.length > 0 && (
					<div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
						{previews.map((preview, index) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: podgląd statyczny, usuwanie po indeksie
								key={`${preview}-${index}`}
								className="relative aspect-square overflow-hidden rounded-md border"
							>
								<img
									src={preview}
									alt={`Zdjęcie ${index + 1}`}
									className="size-full object-cover"
								/>
								<button
									type="button"
									onClick={() => removePhoto(index)}
									aria-label={`Usuń zdjęcie ${index + 1}`}
									className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-90 transition-opacity hover:opacity-100"
								>
									<X className="h-3 w-3" />
								</button>
							</div>
						))}
					</div>
				)}
			</div>

			<Button
				type="submit"
				className={cn(
					"relative h-11 w-full overflow-hidden sm:h-9",
					isSubmitting && "bg-[#0c275f] text-white hover:bg-[#0c275f]/90",
				)}
				disabled={!title.trim() || isSubmitting}
			>
				{isSubmitting && <Loader loading size={4} color="#FFFFFF" className="relative mr-2" />}
				<span className="relative">{submitLabel}</span>
			</Button>
		</form>
	);
}
