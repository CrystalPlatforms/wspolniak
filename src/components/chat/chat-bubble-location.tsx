// SPDX-License-Identifier: AGPL-3.0-or-later
import { ExternalLink, MapPin } from "lucide-react";
import type { ChatMessageItem } from "@/components/chat/chat-view";
import type { LocationPayload } from "@/db/chat/schema";
import { locationPayloadSchema } from "@/db/chat/schema";
import { ChatBubbleText } from "./chat-bubble-text";

/**
 * Payload lokalizacji z wiadomości — parsowany defensywnie Zodem (JSON z DB;
 * uszkodzony kształt → null i bąbelek renderuje fallback tekstowy).
 */
export function parseLocationPayload(payload: unknown): LocationPayload | null {
	const parsed = locationPayloadSchema.safeParse(payload);
	return parsed.success ? parsed.data : null;
}

/**
 * Zewnętrzny link do map — uniwersalny URL Google Maps: w przeglądarce otwiera
 * stronę, na telefonie system proponuje aplikację map (Android/iOS). Bez
 * geokodowania i płatnych API (decyzja PRD #201).
 */
export function mapLinkFor(payload: { lat: number; lng: number }): string {
	return `https://www.google.com/maps/search/?api=1&query=${payload.lat},${payload.lng}`;
}

/**
 * Kompaktowa karta lokalizacji (F3 #216): pinezka + etykieta/współrzędne +
 * zewnętrzny link „Otwórz w mapach". Świadomie BEZ interaktywnej mapy w bąbelku
 * (odrzucone w PRD — ciężkie i nieczytelne na telefonie). Reakcje/odpowiedzi/
 * usuwanie obsługuje wspólny szkielet bąbelka w ChatView.
 */
export function ChatBubbleLocation({ message, own }: { message: ChatMessageItem; own: boolean }) {
	const payload = parseLocationPayload(message.payload);
	if (!payload) {
		return <ChatBubbleText text={message.text} own={own} />;
	}

	return (
		<div data-location-bubble className="flex min-w-40 flex-col gap-1.5">
			<div className="flex items-start gap-2">
				<MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
				<div className="min-w-0">
					{payload.label ? (
						<p className="break-words text-sm font-medium">{payload.label}</p>
					) : null}
					<p className="tabular-nums text-xs opacity-80">
						{payload.lat.toFixed(5)}, {payload.lng.toFixed(5)}
					</p>
				</div>
			</div>
			<a
				href={mapLinkFor(payload)}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-1.5 self-start rounded-full bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
			>
				<ExternalLink className="size-3" aria-hidden="true" />
				Otwórz w mapach
			</a>
		</div>
	);
}
