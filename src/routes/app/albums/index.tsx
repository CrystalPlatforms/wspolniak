// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute } from "@tanstack/react-router";
import { AlbumsList } from "@/components/app/albums-list";

export const Route = createFileRoute("/app/albums/")({
	component: AlbumsPage,
});

function AlbumsPage() {
	// Header (tytuł + Plus) renderuje AlbumsList — 1:1 jak ekran /app/video.
	return (
		<div className="max-w-2xl bg-background px-4 py-6 pb-28 sm:pb-6">
			<AlbumsList />
		</div>
	);
}
