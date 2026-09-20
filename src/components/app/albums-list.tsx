// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getImageUrl } from "@/images/client";

/** Współdzielony klucz zapytania o kafelki albumów (invalidacja po utworzeniu). */
export const ALBUMS_LIST_KEY = ["albums", "list"] as const;

interface AlbumTileDto {
	id: string;
	title: string;
	creatorId: string;
	photoCount: number;
	videoCount: number;
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
 * licznik) w kolejności z API (newest-first). Od #173 na kafelku twórcy/admina
 * jest menu „⋯" (zmiana nazwy, usunięcie albumu).
 */
/** Reviza #187: menu „⋯" z kafelka usunięte — zarządzanie idzie z widoku albumu. */
export function AlbumsList() {
	const navigate = useNavigate();
	const { data, isPending } = useQuery({ queryKey: ALBUMS_LIST_KEY, queryFn: fetchAlbums });

	const tiles = data?.data ?? [];
	const imageAccountHash = data?.meta.imageAccountHash ?? "";

	if (isPending) {
		return (
			<div className="grid grid-cols-2 gap-3" aria-busy="true">
				{[0, 1, 2, 3].map((i) => (
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
				<Button
					variant="ghost"
					size="lg"
					title="Nowy album"
					onClick={() => navigate({ to: "/app/new-album" })}
				>
					<Plus className="size-6" />
				</Button>
			</div>

			{tiles.length === 0 ? (
				<div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
					<p>Nie masz jeszcze albumów. Stwórz pierwszy i zbierz zdjęcia w jednym miejscu.</p>
				</div>
			) : (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{" "}
					{tiles.map((tile) => (
						<div key={tile.id} className="group relative">
							<Link to="/app/albums/$id" params={{ id: tile.id }} className="block">
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
									{tile.videoCount > 0 && ` · ${tile.videoCount} wideo`}
								</p>
							</Link>
						</div>
					))}
				</div>
			)}
		</>
	);
}
