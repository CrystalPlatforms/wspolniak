// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ComposerVideoPicker, type PendingVideo } from "@/components/app/composer-video-picker";
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
import { Loader } from "@/components/ui/loader";
import { runVideoUpload, VideoUploadHttpError } from "@/components/video/use-video-upload";
import { getImageUrl } from "@/images/client";
import { uploadImages } from "@/images/upload";

interface AlbumItemDto {
	id: string;
	kind: string;
	ref: string;
	createdAt: string;
	/** Obecne dla kind = "video" — miniatura i tytuł z YouTube. */
	video?: { id: string; title: string; thumbnailUrl: string } | null;
}

interface AlbumDetailDto {
	id: string;
	title: string;
	creatorId: string;
	items: AlbumItemDto[];
}

interface AlbumDetailResponse {
	data: AlbumDetailDto;
	meta: { imageAccountHash: string };
}

async function fetchAlbumEdit(albumId: string): Promise<AlbumDetailResponse> {
	const res = await fetch(`/api/app/albums/${albumId}`);
	if (!res.ok) throw new Error("Nie udało się pobrać albumu");
	return (await res.json()) as AlbumDetailResponse;
}

async function patchAlbumTitle(albumId: string, title: string) {
	const res = await fetch(`/api/app/albums/${albumId}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ title }),
	});
	if (res.status === 403) throw new Error("Brak uprawnień do zarządzania tym albumem");
	if (!res.ok) {
		const json = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new Error(json?.error ?? "Nie udało się zapisać zmian");
	}
	return res.json();
}

async function deleteAlbumApi(albumId: string) {
	const res = await fetch(`/api/app/albums/${albumId}`, { method: "DELETE" });
	if (res.status === 403) throw new Error("Brak uprawnień do usunięcia tego albumu");
	if (!res.ok) {
		const json = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new Error(json?.error ?? "Nie udało się usunąć albumu");
	}
	return res.json();
}

/** Dokłada elementy do albumu (own_image albo video) — POST items. */
async function addAlbumItems(albumId: string, kind: "own_image" | "video", refs: string[]) {
	const res = await fetch(`/api/app/albums/${albumId}/items`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ kind, refs }),
	});
	if (!res.ok) {
		const json = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new Error(json?.error ?? "Nie udało się dodać zawartości do albumu");
	}
	return res.json();
}

/**
 * Nowe wideo → YouTube (sekwencyjnie, postęp przez label) → album_items.
 * 503 z upload-session = YouTube niepołączony → czytelny polski komunikat.
 */
async function uploadNewVideos(
	albumId: string,
	videos: PendingVideo[],
	onProgressLabel: (label: string | null) => void,
): Promise<void> {
	for (const [index, video] of videos.entries()) {
		try {
			const uploaded = await runVideoUpload(
				{ file: video.file, title: video.title, description: null },
				(p) => {
					const percent =
						p.totalBytes === 0 ? 0 : Math.round((p.uploadedBytes / p.totalBytes) * 100);
					onProgressLabel(`Wideo ${index + 1}/${videos.length} — ${percent}%`);
				},
				{ fetchFn: fetch },
			);
			await addAlbumItems(albumId, "video", [uploaded.youtubeVideoId]);
		} catch (e) {
			if (e instanceof VideoUploadHttpError && e.status === 503) {
				throw new Error("Podłącz YouTube w panelu admina, aby wgrywać wideo.");
			}
			throw e;
		}
	}
}

interface AlbumEditFormProps {
	albumId: string;
	/** Callback po zapisie tytułu (parent odświeża widoki). */
	onSaved: (title: string) => void;
	/** Callback po usunięciu albumu (parent nawiguje do listy). */
	onDeleted: () => void;
	/** Slot na przycisk wstecz w nagłówku (reviza #187). */
	backButton?: ReactNode;
}

/**
 * Ekran „Edytuj album" (reviza #187) — na wzór ekranu tworzenia albumu:
 * nagłówek ze strzałką, mniejszy input tytułu, „Zapisz zmiany" (PATCH) oraz
 * strefa zagrożenia z „Usuń album" (DELETE + dialog potwierdzenia). Zawartość
 * albumu (zdjęcia/wideo) edytuje się per-element w widoku albumu.
 */
export function AlbumEditForm({ albumId, onSaved, onDeleted, backButton }: AlbumEditFormProps) {
	const { data, isPending, isError } = useQuery({
		queryKey: ["albums", "detail", albumId],
		queryFn: () => fetchAlbumEdit(albumId),
	});
	const queryClient = useQueryClient();

	/** Wyciąga istniejący element z albumu (źródło nietknięte — #173). */
	async function removeExistingItem(itemId: string) {
		try {
			const res = await fetch(`/api/app/albums/${albumId}/items/${itemId}`, {
				method: "DELETE",
			});
			if (!res.ok) throw new Error("Nie udało się usunąć elementu z albumu");
			queryClient.invalidateQueries({ queryKey: ["albums"] });
		} catch {
			setSaveError("Nie udało się usunąć elementu z albumu");
		}
	}
	const [title, setTitle] = useState("");
	const [titleInitialized, setTitleInitialized] = useState(false);
	const [savePending, setSavePending] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deletePending, setDeletePending] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	/** Label postępu przy „Zapisz zmiany" („Wideo 1/2 — 45%") w trakcie uploadu. */
	const [savePendingLabel, setSavePendingLabel] = useState<string | null>(null);
	// Reviza #187: nowe pliki do dodania do albumu (upload przy „Zapisz zmiany").
	const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
	const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
	const [pendingVideos, setPendingVideos] = useState<PendingVideo[]>([]);
	const imageInputRef = useRef<HTMLInputElement>(null);

	function handleFilesChange(fileList: FileList | null) {
		const incoming = Array.from(fileList ?? []);
		if (incoming.length === 0) return;
		const merged = [...pendingPhotos, ...incoming];
		setPendingPhotos(merged);
		setPendingPreviews(merged.map((f) => URL.createObjectURL(f)));
		if (imageInputRef.current) imageInputRef.current.value = "";
	}

	function removePendingPhoto(index: number) {
		const merged = pendingPhotos.filter((_, i) => i !== index);
		setPendingPhotos(merged);
		setPendingPreviews(merged.map((f) => URL.createObjectURL(f)));
	}

	// Tytuł wypełniamy RAZ — po pierwszym załadowaniu (edycja usera nie jest
	// nadpisywana przez refetch).
	useEffect(() => {
		if (!titleInitialized && data?.data?.title !== undefined) {
			setTitle(data.data.title);
			setTitleInitialized(true);
		}
	}, [data, titleInitialized]);

	async function handleSave(event: React.FormEvent) {
		event.preventDefault();
		if (!title.trim() || savePending) return;
		setSaveError(null);
		setSavePending(true);
		try {
			// 1. Tytuł (PATCH) — podstawa zapisu.
			await patchAlbumTitle(albumId, title.trim());

			// 2. Nowe zdjęcia → CF Images → album_items (own_image).
			const photoIds = pendingPhotos.length > 0 ? await uploadImages(pendingPhotos) : [];
			if (photoIds.length > 0) {
				await addAlbumItems(albumId, "own_image", photoIds);
			}

			// 3. Nowe wideo → YouTube (sekwencyjnie) → album_items (video).
			await uploadNewVideos(albumId, pendingVideos, setSavePendingLabel);

			onSaved(title.trim());
		} catch (e) {
			setSaveError(e instanceof Error ? e.message : "Nie udało się zapisać zmian");
		} finally {
			setSavePending(false);
			setSavePendingLabel(null);
		}
	}

	async function handleDelete() {
		if (deletePending) return;
		setDeleteError(null);
		setDeletePending(true);
		try {
			await deleteAlbumApi(albumId);
			onDeleted();
		} catch (e) {
			setDeleteError(e instanceof Error ? e.message : "Nie udało się usunąć albumu");
			setDeletePending(false);
			setDeleteOpen(false);
		}
	}

	if (isError) {
		return (
			<p className="py-16 text-center text-muted-foreground">
				Nie znaleziono albumu. Może został usunięty.
			</p>
		);
	}

	return (
		<form onSubmit={handleSave} className="space-y-4">
			<div className="mb-2 flex items-center gap-4">
				{backButton}
				<h1 className="text-2xl font-bold text-foreground">Edytuj album</h1>
				<div className="flex-1" />
			</div>

			{isPending && <p className="py-8 text-center text-sm text-muted-foreground">Ładowanie…</p>}

			<div className="space-y-2">
				<Label htmlFor="album-edit-title">Tytuł</Label>
				<Input
					id="album-edit-title"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="np. Wakacje 2026"
					maxLength={100}
				/>
			</div>

			{saveError && (
				<p role="alert" className="text-sm text-destructive">
					{saveError}
				</p>
			)}

			{/* Reviza #187: dodawanie zawartości w edycji — zdjęcia i wideo.
			    Upload rusza przy „Zapisz zmiany". */}
			<div className="space-y-2">
				<Label>Zawartość albumu</Label>
				{/* Istniejące elementy — X wyciąga z albumu (źródło nietknięte, #173). */}
				{data && data.data.items.length > 0 && (
					<div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
						{data.data.items.map((item) => {
							const isVideo = item.kind === "video";
							const src = isVideo
								? (item.video?.thumbnailUrl ?? "")
								: getImageUrl({
										accountHash: data.meta.imageAccountHash,
										cfImageId: item.ref,
										variant: "thumbnail",
									});
							return (
								<div
									key={item.id}
									className="relative aspect-square overflow-hidden rounded-md border"
								>
									<img
										src={src}
										alt={isVideo ? (item.video?.title ?? "Wideo") : "Zdjęcie w albumie"}
										className="size-full object-cover"
									/>
									{isVideo && (
										<span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-xs text-foreground">
											wideo
											{item.video?.title ? ` · ${item.video.title}` : ""}
										</span>
									)}
									<button
										type="button"
										onClick={() => removeExistingItem(item.id)}
										aria-label={`Usuń z albumu: ${isVideo ? (item.video?.title ?? "wideo") : `zdjęcie ${item.ref}`}`}
										className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-90 transition-opacity hover:opacity-100"
									>
										<X className="h-3 w-3" />
									</button>
								</div>
							);
						})}
					</div>
				)}
				{data && data.data.items.length === 0 && (
					<p className="text-sm text-muted-foreground">Album jest jeszcze pusty.</p>
				)}

				<Label>Dodaj nowe</Label>
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
						title={pendingPhotos.length > 0 ? `${pendingPhotos.length} zdjęć` : "Dodaj zdjęcia"}
					>
						<ImagePlus className="h-5 w-5" />
						Dodaj zdjęcia {pendingPhotos.length > 0 ? `(${pendingPhotos.length})` : ""}
					</Button>
					<ComposerVideoPicker videos={pendingVideos} onChange={setPendingVideos} />
				</div>

				{pendingPreviews.length > 0 && (
					<div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
						{pendingPreviews.map((preview, index) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: podgląd statyczny, usuwanie po indeksie
								key={`${preview}-${index}`}
								className="relative aspect-square overflow-hidden rounded-md border"
							>
								<img
									src={preview}
									alt={`Nowe zdjęcie ${index + 1}`}
									className="size-full object-cover"
								/>
								<button
									type="button"
									onClick={() => removePendingPhoto(index)}
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

			<Button type="submit" disabled={!title.trim() || savePending} className="h-11 w-full sm:h-9">
				<Loader loading={savePending} />
				{savePending ? (savePendingLabel ?? "Zapisywanie...") : "Zapisz zmiany"}
			</Button>

			{/* Strefa zagrożenia (reviza #187c): usuwanie albumu na ekranie edycji. */}
			<div className="rounded-md border border-destructive/30 p-4">
				<p className="mb-2 text-sm text-muted-foreground">
					Usunięcie albumu skasuje zdjęcia dodane bezpośrednio do albumu. Tej operacji nie można
					cofnąć.
				</p>
				<Button
					type="button"
					variant="destructive"
					className="h-11 w-full sm:h-9"
					onClick={() => setDeleteOpen(true)}
				>
					Usuń album
				</Button>
			</div>

			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent className="max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Usuń album</DialogTitle>
						<DialogDescription>
							Czy na pewno chcesz usunąć album „{data?.data?.title ?? ""}"? Zdjęcia dodane
							bezpośrednio do albumu zostaną usunięte z Cloudflare, a pożyczone z postów i wideo
							zostaną na miejscu. Tej operacji nie można cofnąć.
						</DialogDescription>
					</DialogHeader>
					{deleteError && (
						<p role="alert" className="text-sm text-destructive">
							{deleteError}
						</p>
					)}
					<DialogFooter className="gap-2 sm:gap-0">
						<Button
							type="button"
							variant="outline"
							onClick={() => setDeleteOpen(false)}
							disabled={deletePending}
						>
							Anuluj
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleDelete}
							disabled={deletePending}
						>
							<Loader loading={deletePending} />
							{deletePending ? "Usuwanie..." : "Usuń"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</form>
	);
}
