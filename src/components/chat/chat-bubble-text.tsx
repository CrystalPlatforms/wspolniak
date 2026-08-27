// SPDX-License-Identifier: AGPL-3.0-or-later
import { highlightMentions } from "@/components/app/mentions-text";

/**
 * Tekst bąbelka czatu z wyróżnionym `@imię` (#168). Cudze bąbelki: mention
 * kolorem marki + pogrubienie (spójnie z MentionText postów/komentarzy);
 * własne bąbelki (biały tekst na bg-primary — zieleń byłaby niewidoczna):
 * podkreślenie. Reszta tekstu zostaje zwykłymi segmentami.
 */
export function ChatBubbleText({ text, own }: { text: string; own: boolean }) {
	return (
		<p className="whitespace-pre-wrap break-words text-sm">
			{highlightMentions(text).map((segment, index) =>
				segment.isMention ? (
					<span
						key={`m-${segment.text}-${index}`}
						className={own ? "underline" : "font-medium text-primary"}
					>
						{segment.text}
					</span>
				) : (
					<span key={`t-${segment.text}-${index}`}>{segment.text}</span>
				),
			)}
		</p>
	);
}
