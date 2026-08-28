// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Images, Play } from "lucide-react";
import { useState } from "react";
import { AlbumActionsMenu } from "@/components/app/album-actions-menu";
import { AlbumCreateDialog } from "@/components/app/album-create-dialog";
import { AlbumItemMenu } from "@/components/app/album-item-menu";
import { ImageLightbox } from "@/components/app/image-lightbox";
import { getImageUrl } from "@/images/client";

interface AlbumVideoMetaDto {
	id: string;
	title: string;
	thumbnailUrl: string;
}

interface AlbumItemDto {
	id: string;
	albumId: string;
	kind: string;
	ref: string;
	createdAt: string;
	/** Obecne dla kind = "video" (#172); null dla zdjęć i wideo bez rekordu. */
	video?: AlbumVideoMetaDto | null;
}

interface AlbumDetailDto {
	id: string;
	title: string;
	creatorId: string;
	/** Ręczna okładka (#173) — id elementu; null = pierwsze zdjęcie. */
	coverItemId: string | null;
	items: AlbumItemDto[];
}

interface AlbumsDetailResponse {
	data: AlbumDetailDto;
	meta: { imageAccountHash: string };
}

async function fetchAlbumDetail(albumId: string): Promise<AlbumsDetailResponse> {
	const res = await fetch(`/api/app/albums/${albumId}`);
	if (!res.ok) throw new Error("Nie znaleziono albumu");
	return (await res.json()) as AlbumsDetailResponse;
}

interface AlbumViewProps {
	albumId: string;
	/** Sesja — akcje zarządzania tylko dla twórcy/admina (#173). */
	currentUserId: string;
	currentUserRole: string;
}

/**
 * Widok pojedynczego albumu (#170): siatka elementów w kolejności dodawania;
 * klik na zdjęcie otwiera istniejący ImageLightbox (zoom, swipe). Od #173
 * twórca/admin ma menu „⋯" w nagłówku (zmiana nazwy, usunięcie albumu)
 * oraz menu per element (okładka / usuń z albumu).
 */
export function AlbumView({ albumId, currentUserId, currentUserRole }: AlbumViewProps) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const { data, isPending, isError } = useQuery({
		queryKey: ["albums", "detail", albumId],
		queryFn: () => fetchAlbumDetail(albumId),
	});
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const isAdmin = currentUserRole === "admin";

	async function setCover(itemId: string) {
		const res = await fetch(`/api/app/albums/${albumId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ coverItemId: itemId }),
		});
		if (res.status === 400) throw new Error("Okładka musi być zdjęciem z tego albumu");
		if (res.status === 403) throw new Error("Brak uprawnień do zarządzania tym albumem");
		if (!res.ok) throw new Error("Nie udało się ustawić okładki");
	}

	async function removeItem(itemId: string) {
		const res = await fetch(`/api/app/albums/${albumId}/items/${itemId}`, { method: "DELETE" });
		if (res.status === 403) throw new Error();
		if (res.status === 403) throw new Error("Brak uprawnień do zarządzania tym albumem");
		if (!res.ok) throw new Error("Nie udało się usunąć elementu z albumu");
	}

	const setCoverMutation = useMutation({
		mutationFn: (itemId: string) => setCover(itemId),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["albums"] }),
	});

	const removeItemMutation = useMutation({
		mutationFn: (itemId: string) => removeItem(itemId),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["albums"] }),
	});

	if (isPending) {
		return (
			<div className="grid grid-cols-3 gap-2" aria-busy="true">
				{[0, 1, 2].map((i) => (
					<div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
				))}
			</div>
		);
	}

	if (isError || !data) {
		return (
			<p className="py-16 text-center text-muted-foreground">
				Nie znaleziono albumu. Może został usunięty.
			</p>
		);
	}

	const album = data.data;
	const imageAccountHash = data.meta.imageAccountHash;
	const canManage = album.creatorId === currentUserId || isAdmin;
	const hasManualCover = album.coverItemId !== null;

	// Lightbox otwieraja tylko zdjecia (#172); wideo ma wlasny kafelek z linkiem.
	const lightboxImages = album.items
		.filter((item) => item.kind !== "video")
		.map((item, index) => ({
			id: item.id,
			src: getImageUrl({ accountHash: imageAccountHash, cfImageId: item.ref, variant: "public" }),
			alt: `Zdjęcie ${index + 1}`,
		}));
	const photoIndexById = new Map(lightboxImages.map((img, i) => [img.id, i] as const));
	const photoTotal = lightboxImages.length;
	const videoTotal = album.items.length - photoTotal;
	// #175 — „Pobierz wideo" liczy się po wideo z metadanymi (usunięte z biblioteki
	// przed kaskadą F5 pomijane — spójnie z endpointem videos.html).
	const hasDownloadableVideos = album.items.some((item) => item.video);

	return (
		<div>
			<div className="mb-6">
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="text-2xl font-bold text-foreground">{album.title}</h1>
					<div className="flex-1" />
					<AlbumActionsMenu
						albumId={albumId}
						albumTitle={album.title}
						canManage={canManage}
						onAddPhotos={() => setAddOpen(true)}
						zipUrl={photoTotal > 0 ? `/api/app/albums/${albumId}/photos.zip` : null}
						videosUrl={hasDownloadableVideos ? `/api/app/albums/${albumId}/videos.html` : null}
						triggerClassName="size-10"
						iconClassName="size-6"
						onDeleted={() => navigate({ to: "/app/albums" })}
					/>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					{photoTotal} {photoTotal === 1 ? "zdjęcie" : "zdjęć"}
					{videoTotal > 0 && ` · ${videoTotal} wideo`}
				</p>
			</div>

			{album.items.length === 0 && (
				<div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
					<Images className="size-10" />
					<p>Ten album jest pusty.</p>
				</div>
			)}

			<div className="grid grid-cols-3 gap-2">
				{album.items.map((item) => {
					if (item.kind === "video") {
						// Wideo usuniete z biblioteki przed kaskada F5 — pomiń w siatce.
						if (!item.video) return null;
						return (
							<div key={item.id} className="relative">
								<Link
									to="/app/video/$id"
									params={{ id: item.video.id }}
									className="group relative block aspect-square overflow-hidden rounded-lg border bg-muted"
									aria-label={`Otwórz wideo ${item.video.title}`}
								>
									<img
										src={item.video.thumbnailUrl}
										alt={item.video.title}
										className="size-full object-cover"
										loading="lazy"
									/>
									<span className="absolute inset-0 flex items-center justify-center">
										<span className="flex size-10 items-center justify-center rounded-lg bg-black">
											<Play className="size-4 fill-primary text-primary" />
										</span>
									</span>
								</Link>
								{canManage && (
									<div className="absolute right-1 top-1">
										<AlbumItemMenu
											kind={item.kind}
											isCurrentCover={false}
											onSetCover={() => setCoverMutation.mutate(item.id)}
											onRemove={() => removeItemMutation.mutate(item.id)}
										/>
									</div>
								)}
							</div>
						);
					}
					const photoIndex = photoIndexById.get(item.id) ?? 0;
					return (
						<div key={item.id} className="relative">
							<button
								type="button"
								onClick={() => setLightboxIndex(photoIndex)}
								className="relative block aspect-square overflow-hidden rounded-lg border bg-muted"
								aria-label={`Otwórz zdjęcie ${photoIndex + 1}`}
							>
								<img
									src={getImageUrl({
										accountHash: imageAccountHash,
										cfImageId: item.ref,
										variant: "thumbnail",
									})}
									alt={`Zdjęcie ${photoIndex + 1}`}
									className="size-full object-cover"
								/>
							</button>
							{canManage && (
								<div className="absolute right-1 top-1">
									<AlbumItemMenu
										kind={item.kind}
										isCurrentCover={hasManualCover && album.coverItemId === item.id}
										onSetCover={() => setCoverMutation.mutate(item.id)}
										onRemove={() => removeItemMutation.mutate(item.id)}
									/>
								</div>
							)}
						</div>
					);
				})}
			</div>

			<ImageLightbox
				images={lightboxImages}
				initialIndex={lightboxIndex ?? 0}
				open={lightboxIndex !== null}
				onClose={() => setLightboxIndex(null)}
			/>

			<AlbumCreateDialog
				mode="append"
				albumId={albumId}
				open={addOpen}
				onOpenChange={setAddOpen}
				onCreated={() => queryClient.invalidateQueries({ queryKey: ["albums"] })}
			/>
		</div>
	);
}
