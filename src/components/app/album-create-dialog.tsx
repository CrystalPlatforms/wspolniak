// SPDX-License-Identifier: AGPL-3.0-or-later
import { X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadImages } from "@/images/upload";

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif";

interface AlbumCreateDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Wywoływane po utworzeniu albumu (parent odświeża listę). */
	onCreated: (album: { id: string; title: string }) => void;
}

/**
 * Dialog tworzenia albumu (#170): tytuł + multi-select zdjęć (ten sam pipeline
 * HEIC/co kompozytor posta — uploadImages najpierw, potem POST /api/app/albums).
 * Walidacja kliencka blokuje submit bez tytułu lub bez zdjęć; serwer waliduje
 * ponownie (Zod) i odrzuca 400.
 */
export function AlbumCreateDialog({ open, onOpenChange, onCreated }: AlbumCreateDialogProps) {
	const [title, setTitle] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [previews, setPreviews] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	function handleFilesChange(filesList: FileList | null) {
		const incoming = Array.from(filesList ?? []);
		if (incoming.length === 0) return;
		const merged = [...files, ...incoming];
		setFiles(merged);
		setPreviews(merged.map((f) => URL.createObjectURL(f)));
		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	function removePhoto(index: number) {
		const merged = files.filter((_, i) => i !== index);
		setFiles(merged);
		setPreviews(merged.map((f) => URL.createObjectURL(f)));
	}

	function resetAndClose() {
		setTitle("");
		setFiles([]);
		setPreviews([]);
		setError(null);
		setSubmitting(false);
		onOpenChange(false);
	}

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		if (title.trim().length === 0) {
			setError("Podaj tytuł albumu");
			return;
		}
		if (files.length === 0) {
			setError("Dodaj co najmniej jedno zdjęcie");
			return;
		}

		setError(null);
		setSubmitting(true);
		try {
			const photoIds = await uploadImages(files);
			const res = await fetch("/api/app/albums", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: title.trim(), photoIds }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Nie udało się utworzyć albumu");
			}
			const json = (await res.json()) as { data: { id: string; title: string } };
			onCreated(json.data);
			resetAndClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Nie udało się utworzyć albumu");
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<form onSubmit={handleSubmit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>Nowy album</DialogTitle>
						<DialogDescription>
							Zbierz zdjęcia w albumie — album nie pojawia się na feedzie.
						</DialogDescription>
					</DialogHeader>

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

					<div className="space-y-2">
						<Label htmlFor="album-photos" className="sr-only">
							Dodaj zdjęcia
						</Label>
						<input
							ref={fileInputRef}
							id="album-photos"
							type="file"
							accept={ACCEPTED_IMAGE_TYPES}
							multiple
							onChange={(e) => handleFilesChange(e.target.files)}
							className="hidden"
						/>
						<Button
							type="button"
							variant="outline"
							className="w-full"
							onClick={() => fileInputRef.current?.click()}
						>
							Dodaj zdjęcia {files.length > 0 ? `(${files.length})` : ""}
						</Button>
						{previews.length > 0 && (
							<div className="grid grid-cols-3 gap-2">
								{previews.map((preview, index) => (
									<div
										key={preview}
										className="relative aspect-square overflow-hidden rounded-md border"
									>
										<img
											src={preview}
											alt={`Zdjęcie ${index + 1}`}
											className="size-full object-cover"
										/>
										{/* Czerwony X w rogu — usuwa zdjęcie z batcha (reviza usera #170). */}
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

					{error && (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					)}

					<DialogFooter>
						<Button type="button" variant="ghost" onClick={resetAndClose}>
							Anuluj
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting ? "Tworzenie..." : "Utwórz"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
