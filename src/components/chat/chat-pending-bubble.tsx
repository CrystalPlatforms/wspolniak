// SPDX-License-Identifier: AGPL-3.0-or-later
import { ChatBubbleText } from "./chat-bubble-text";

/** Wiadomość w locie (optymistyczna) — Bubble visible natychmiast, status steruje paskiem. */
export interface PendingMessage {
	clientId: string;
	text: string;
	replyToId?: string;
	replyText: string | null;
	status: "sending" | "error";
}

/**
 * Bąbelek wiadomości w locie (F1 #152): zawsze własny, zjeżdża z dołu (Telegram),
 * pasek postępu pod nim; błąd → czerwony pasek + przycisk „Ponów" (F6 #157).
 * Tekst przez ChatBubbleText — mentiony `@imię` podkreślone jak w zatwierdzonych (#168).
 */
export function ChatPendingBubble({
	message,
	onRetry,
}: {
	message: PendingMessage;
	onRetry: (message: PendingMessage) => void;
}) {
	return (
		<div data-side="own" className="chat-bubble-in mt-0.5 flex w-full flex-col items-end">
			{message.replyToId ? (
				// Quote odpowiedzi w locie — tekst z lokalnego snapshotu (F5).
				<div className="mb-0.5 max-w-[85%] truncate rounded-lg border-l-2 border-primary/60 bg-muted/60 px-2 py-1 text-right text-xs text-muted-foreground">
					{message.replyText}
				</div>
			) : null}
			<div
				className={`flex max-w-[85%] items-end gap-2 rounded-2xl rounded-br-md px-3 py-2 bg-primary text-primary-foreground ${message.status === "error" ? "opacity-80 ring-1 ring-destructive" : ""}`}
			>
				<ChatBubbleText text={message.text} own />
			</div>
			<div
				className="mt-1 h-[3px] w-24 overflow-hidden rounded-full bg-primary/20"
				role="progressbar"
				aria-label={message.status === "error" ? "Błąd wysyłania" : "Wysyłanie"}
			>
				<div
					className={`h-full w-1/3 rounded-full ${message.status === "error" ? "bg-destructive" : "chat-progress-indeterminate bg-primary"}`}
				/>
			</div>
			{message.status === "error" ? (
				<button
					type="button"
					onClick={() => onRetry(message)}
					className="mt-1 text-xs font-medium text-destructive hover:underline"
				>
					Ponów
				</button>
			) : null}
		</div>
	);
}
