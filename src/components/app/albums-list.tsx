// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AlbumCreateDialog } from "@/components/app/album-create-dialog";
import { Button } from "@/components/ui/button";
import { getImageUrl } from "@/images/client";

/** Współdzielony klucz zapytania o kafelki albumów (invalidacja po utworzeniu). */
export const ALBUMS_LIST_KEY = ["albums", "list"] as const;

interface AlbumTileDto {
	id: string;
	title: string;
	photoCount: number;
	coverImageId: string | null;
}

interface AlbumsResponse {
	data: AlbumTileDto[];
	meta: { imageAccountHash: string };
}

async function fetchAlbums(): Promise<AlbumsResponse> {
	const res = await fetch("/api/app/albums");
	if (!res.ok) throw new Error("Nie udało się pobrać albumów");
	return (await res.json()) as AlbumsResponse;
}

/**
 * Sekcja „Albumy" (#170): siatka kafelków (okładka = pierwsze zdjęcie, tytuł,
 * licznik) w kolejności z API (newest-first). „Nowy album" otwiera dialog
 * tworzenia; po sukcesie lista odświeża się i nowy kafelek jest na górze.
 */
export function AlbumsList() {
	const queryClient = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const { data, isPending } = useQuery({ queryKey: ALBUMS_LIST_KEY, queryFn: fetchAlbums });

	const tiles = data?.data ?? [];
	const imageAccountHash = data?.meta.imageAccountHash ?? "";

	if (isPending) {
		return (
			<div className="grid grid-cols-2 gap-3" aria-busy="true">
				{[0, 1, 2, 3].map((i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: statyczne szkielety
					<div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
				))}
			</div>
		);
	}

	return (
		<>
			{/* Header 1:1 jak w /app/video (#170 reviza): tytuł + ghost Plus (sama ikona). */}
			<div className="mb-6 flex items-center gap-2">
				<h1 className="text-2xl font-bold text-foreground">Albumy</h1>
				<div className="flex-1" />
				<Button variant="ghost" size="lg" title="Nowy album" onClick={() => setCreateOpen(true)}>
					<Plus className="size-6" />
				</Button>
			</div>

			{tiles.length === 0 ? (
				<div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
					<p>Nie masz jeszcze albumów. Stwórz pierwszy i zbierz zdjęcia w jednym miejscu.</p>
				</div>
			) : (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{tiles.map((tile) => (
						<a key={tile.id} href={`/app/albums/${tile.id}`} className="group block">
							<div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
								{tile.coverImageId && (
									<img
										src={getImageUrl({
											accountHash: imageAccountHash,
											cfImageId: tile.coverImageId,
											variant: "thumbnail",
										})}
										alt={`Okładka ${tile.title}`}
										className="size-full object-cover transition-transform group-hover:scale-105"
									/>
								)}
							</div>
							<p className="mt-2 truncate text-sm font-medium text-foreground">{tile.title}</p>
							<p className="text-xs text-muted-foreground">
								{tile.photoCount} {tile.photoCount === 1 ? "zdjęcie" : "zdjęć"}
							</p>
						</a>
					))}
				</div>
			)}

			<AlbumCreateDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreated={() => {
					queryClient.invalidateQueries({ queryKey: ALBUMS_LIST_KEY });
				}}
			/>
		</>
	);
}
