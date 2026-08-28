// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

// Kropka „nowe albumy" przy pozycji „Albumy" (#176). Stan „widziane" per urządzenie
// (localStorage). Brak timestampu = „nic nie widziane" → kropka świeci też dla
// istniejących albumów (jednorazowe nagłośnienie sekcji) i gaśnie po wejściu w Albumy.

const ALBUMS_SEEN_KEY = "wspolniak:albums-seen-at";
const SEEN_EVENT = "wspolniak:albums-seen";

/** Timestamp „widzianych albumów" z localStorage; null = nigdy nie otwarte. */
export function getAlbumsSeenAtMs(): number | null {
	try {
		const raw = window.localStorage.getItem(ALBUMS_SEEN_KEY);
		if (raw === null) return null;
		const ms = Number(raw);
		return Number.isFinite(ms) ? ms : null;
	} catch {
		return null;
	}
}

/** Oznacza albumy jako obejrzane — przy wejściu w sekcję Albumów (#176). */
export function markAlbumsSeen(): void {
	try {
		window.localStorage.setItem(ALBUMS_SEEN_KEY, String(Date.now()));
		window.dispatchEvent(new Event(SEEN_EVENT));
	} catch {
		// localStorage niedostępny — kropka działa dalej na wartości null
	}
}

/** Live odczyt: re-aguje na markAlbumsSeen (zdarzenie) i na inne karty (storage). */
export function useAlbumsSeenAtMs(): number | null {
	const [seenAt, setSeenAt] = useState<number | null>(() => getAlbumsSeenAtMs());
	useEffect(() => {
		function update() {
			setSeenAt(getAlbumsSeenAtMs());
		}
		window.addEventListener(SEEN_EVENT, update);
		window.addEventListener("storage", update);
		return () => {
			window.removeEventListener(SEEN_EVENT, update);
			window.removeEventListener("storage", update);
		};
	}, []);
	return seenAt;
}

/**
 * Kropka „new": świeci gdy najnowszy album jest nowszy niż timestamp widzianych
 * (brak timestampu → traktuj jak 0 → kropka widoczna). Dane: GET /api/app/albums/newest.
 */
export function useAlbumsNewDot(): boolean {
	const seenAt = useAlbumsSeenAtMs();
	const { data } = useQuery({
		queryKey: ["albums", "newest"],
		queryFn: async (): Promise<string | null> => {
			const res = await fetch("/api/app/albums/newest");
			if (!res.ok) return null;
			const body = (await res.json()) as { data: { createdAt: string } | null };
			return body.data?.createdAt ?? null;
		},
		staleTime: 60_000,
	});
	if (data === undefined || data === null) return false;
	return new Date(data).getTime() > (seenAt ?? 0);
}
