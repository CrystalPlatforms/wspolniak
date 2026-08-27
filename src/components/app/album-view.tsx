// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ImageLightbox } from "@/components/app/image-lightbox";
import { getImageUrl } from "@/images/client";

interface AlbumItemDto {
	id: string;
	albumId: string;
	kind: string;
	ref: string;
	createdAt: string;
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
	const { data, isPending, isError } = useQuery({
		queryKey: ["albums", "detail", albumId],
		queryFn: () => fetchAlbumDetail(albumId),
	});
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

	const lightboxImages = album.items.map((item, index) => ({
		id: item.id,
		src: getImageUrl({ accountHash: imageAccountHash, cfImageId: item.ref, variant: "public" }),
		alt: `Zdjęcie ${index + 1}`,
	}));

	return (
		<div>
			<h1 className="mb-6 text-2xl font-bold text-foreground">{album.title}</h1>

			<div className="grid grid-cols-3 gap-2">
				{album.items.map((item, index) => (
					<button
						key={item.id}
						type="button"
						onClick={() => setLightboxIndex(index)}
						className="relative block aspect-square overflow-hidden rounded-lg border bg-muted"
						aria-label={`Otwórz zdjęcie ${index + 1}`}
					>
						<img
							src={getImageUrl({
								accountHash: imageAccountHash,
								cfImageId: item.ref,
								variant: "thumbnail",
							})}
							alt={`Zdjęcie ${index + 1}`}
							className="size-full object-cover"
						/>
					</button>
				))}
			</div>

			<ImageLightbox
				images={lightboxImages}
				initialIndex={lightboxIndex ?? 0}
				open={lightboxIndex !== null}
				onClose={() => setLightboxIndex(null)}
			/>
		</div>
	);
}
