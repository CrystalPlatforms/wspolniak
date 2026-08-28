// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { markAlbumsSeen } from "@/core/albums-seen";

/**
 * Layout trasy `/app/albums` — renderuje wyłącznie `<Outlet>` dla dzieci:
 * listy (`albums/index.tsx`) oraz strony szczegółów (`albums.$id.tsx`).
 * Struktura po lekcji z wideo (F4): rodzic bez `<Outlet>` renderował feed
 * zamiast detaila. Brak flagi w F1 (#170) — sekcja zawsze widoczna.
 */
export const Route = createFileRoute("/app/albums")({
	component: AlbumsLayout,
});

function AlbumsLayout() {
	useEffect(() => {
		markAlbumsSeen();
	}, []);
	return <Outlet />;
}
