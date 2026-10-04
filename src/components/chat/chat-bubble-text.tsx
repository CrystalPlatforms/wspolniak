// SPDX-License-Identifier: AGPL-3.0-or-later
import { highlightMentions } from "@/components/app/mentions-text";
import { parseLinkTokens } from "./link-tokens";

/**
 * Tekst bąbelka czatu z wyróżnionym `@imię` (#168) i tokenami linku (#214).
 * Cudze bąbelki: mention kolorem marki + pogrubienie; własne (biały tekst na
 * bg-primary — zieleń byłaby niewidoczna): podkreślenie. Tokeny
 * `[tytuł|tekst](url)` renderują się jako klikalne chipy z odwróconym tłem
 * (bg-foreground + text-background: czarne w jasnym, białe w ciemnym trybie),
 * otwierane w nowej karcie.
 */
export function ChatBubbleText({ text, own }: { text: string; own: boolean }) {
	return (
		<p className="whitespace-pre-wrap break-words text-sm">
			{parseLinkTokens(text).map((segment, index) =>
				segment.kind === "link" ? (
					<a
						key={`l-${segment.url}-${index}`}
						href={segment.url}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-block rounded-full bg-foreground px-2 py-0.5 font-medium text-background transition-opacity hover:opacity-80"
					>
						{segment.label}
					</a>
				) : (
					highlightMentions(segment.text).map((mentionSegment, mentionIndex) =>
						mentionSegment.isMention ? (
							<span
								key={`m-${mentionSegment.text}-${index}-${mentionIndex}`}
								className={own ? "underline" : "font-medium text-primary"}
							>
								{mentionSegment.text}
							</span>
						) : (
							<span key={`t-${mentionSegment.text}-${index}-${mentionIndex}`}>
								{mentionSegment.text}
							</span>
						),
					)
				),
			)}
		</p>
	);
}
