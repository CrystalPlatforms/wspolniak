// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconExternalLink, IconMapPin } from "@tabler/icons-react";
import { AttachmentCard } from "@/components/app/attachment-card";
import type { PostLocationPayload } from "@/db/posts/schema";

/**
 * Zewnętrzny link do map — uniwersalny URL Google Maps: w przeglądarce otwiera
 * stronę, na telefonie system proponuje aplikację map. Bez geokodowania i bez
 * płatnych API (PRD #240).
 */
export function mapLinkFor(location: { lat: number; lng: number }): string {
	return `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;
}

interface PostLocationProps {
	location: PostLocationPayload;
}

/**
 * Karta lokalizacji (#242): wspólny styl z kafelkami plików (AttachmentCard) —
 * pinezka + nazwa/etykieta albo współrzędne + przycisk "Otwórz w mapach"
 * otwierający mapy w nowej karcie. Świadomie BEZ interaktywnej mapy w karcie
 * posta — kafle dławiłyby feed (odrzucone w PRD).
 */
export function PostLocation({ location }: PostLocationProps) {
	const coords = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
	return (
		<AttachmentCard
			icon={IconMapPin}
			title={location.label?.trim() || coords}
			subtitle={coords}
			actionLabel="Otwórz w mapach"
			actionIcon={IconExternalLink}
			actionHref={mapLinkFor(location)}
		/>
	);
}
