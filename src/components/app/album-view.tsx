// SPDX-License-Identifier: AGPL-3.0-or-later

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Images, Play } from "lucide-react";
import { useState } from "react";
import { AlbumCreateDialog } from "@/components/app/album-create-dialog";
import { ImageLightbox } from "@/components/app/image-lightbox";
import { Button } from "@/components/ui/button";
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
}

/**
 * Widok pojedynczego albumu (#170): siatka zdjęć w kolejności dodawania;
 * klik otwiera istniejący ImageLightbox (zoom, swipe) od klikniętego zdjęcia.
 * Ścieżki zdjęć buduje getImageUrl (wariant public) z hashem konta z API.
 */
export function AlbumView({ albumId }: AlbumViewProps) {
	const queryClient = useQueryClient();
	const { data, isPending, isError } = useQuery({
		queryKey: ["albums", "detail", albumId],
		queryFn: () => fetchAlbumDetail(albumId),
	});
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	const [addOpen, setAddOpen] = useState(false);

	if (isPending) {
		return (
			<div className="grid grid-cols-3 gap-2" aria-busy="true">
				{[0, 1, 2].map((i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: statyczne szkielety
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

	return (
		<div>
			<div className="mb-6">
				<div className="flex items-center gap-2">
					<h1 className="text-2xl font-bold text-foreground">{album.title}</h1>
					<div className="flex-1" />
					<Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
						<Images className="size-4" />
						Dodaj zdjęcia
					</Button>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					{photoTotal} {photoTotal === 1 ? "zdjęcie" : "zdjęć"}
					{videoTotal > 0 && ` · ${videoTotal} wideo`}
				</p>
			</div>

			<div className="grid grid-cols-3 gap-2">
				{album.items.map((item) => {
					if (item.kind === "video") {
						// Wideo usuniete z biblioteki przed kaskada F5 — pomiń w siatce.
						if (!item.video) return null;
						return (
							<Link
								key={item.id}
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
						);
					}
					const photoIndex = photoIndexById.get(item.id) ?? 0;
					return (
						<button
							key={item.id}
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
