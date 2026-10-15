// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from "@tanstack/react-router";
import { FileQuestion, X } from "lucide-react";
import type { ChatMessageItem, ChatPostPreview } from "@/components/chat/chat-api";
import { postPayloadSchema } from "@/db/chat/schema";
import { ChatBubbleText } from "./chat-bubble-text";

/** Payload posta z wiadomości — defensywnie Zodem (uszkodzony → null, fallback tekstowy). */
function parsePostPayload(payload: unknown): { postId: string } | null {
	const parsed = postPayloadSchema.safeParse(payload);
	return parsed.success ? parsed.data : null;
}

/**
 * Karta udostępnionego posta (F5 #218): miniatura + 1–2 linijki wycinka + autor,
 * klik prowadzi do posta. Post usunięty (`post: null` — serwer nie resolwuje)
 * → placeholder „Post usunięty" zamiast martwego linku. Współdzielona przez
 * bąbelek czatu i podgląd w composerze.
 */
function ChatPostCard({ post, className = "" }: { post: ChatPostPreview; className?: string }) {
	return (
		<Link
			to="/app/post/$id"
			params={{ id: post.id }}
			data-post-card
			className={`flex w-60 max-w-full items-stretch gap-2 overflow-hidden rounded-lg bg-background text-foreground transition-colors hover:bg-accent ${className}`}
		>
			{post.thumbnailUrl ? (
				<img
					src={post.thumbnailUrl}
					alt=""
					loading="lazy"
					className="h-16 w-16 shrink-0 self-center rounded-md object-cover"
				/>
			) : null}
			<span className="flex min-w-0 flex-col justify-center gap-0.5 py-1.5 pr-2">
				{post.snippet ? (
					<span className="line-clamp-2 text-xs leading-snug">{post.snippet}</span>
				) : null}
				<span className="text-[10px] text-muted-foreground">{post.authorName}</span>
			</span>
		</Link>
	);
}

/** Placeholder karty posta usuniętego (F5 #218) — zamiast martwego linku. */
function ChatPostDeletedCard() {
	return (
		<div
			data-post-card-deleted
			className="flex w-60 max-w-full items-center gap-2 rounded-lg bg-background/60 px-2.5 py-2 text-foreground"
		>
			<FileQuestion className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
			<span className="text-xs text-muted-foreground">Post usunięty</span>
		</div>
	);
}

/**
 * Bąbelek udostępnionego posta (F5 #218): karta re-resolvowana przez serwer
 * przy każdym odczycie (edycje/usunięcia posta są widoczne); komentarz nadawcy
 * (kolumna `text`) nad kartą. Uszkodzony payload → fallback tekstowy.
 */
export function ChatBubblePost({ message, own }: { message: ChatMessageItem; own: boolean }) {
	if (!parsePostPayload(message.payload)) {
		return <ChatBubbleText text={message.text} own={own} />;
	}
	return (
		<div data-post-bubble className="flex min-w-40 flex-col gap-1.5">
			{message.text ? <ChatBubbleText text={message.text} own={own} /> : null}
			{message.post ? <ChatPostCard post={message.post} /> : <ChatPostDeletedCard />}
		</div>
	);
}

/**
 * Podgląd draftu w composerze (F5 #218): miniatura + wycinek + autor + krzyżyk
 * anulowania. Wysyłka ręczna — samo otwarie czatu z draftem NIC nie wysyła
 * (decyzja właściciela: nadawca może dopisać komentarz).
 */
export function ChatPostDraftPreview({
	post,
	onCancel,
}: {
	post: ChatPostPreview;
	onCancel: () => void;
}) {
	return (
		<div
			data-post-draft-preview
			className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-2 py-1.5"
		>
			<div className="min-w-0 flex-1">
				<p className="text-xs font-medium text-muted-foreground">Udostępnij post</p>
				<ChatPostCard
					post={post}
					className="mt-1 border-0 bg-transparent p-0 hover:bg-transparent"
				/>
			</div>
			<button
				type="button"
				onClick={onCancel}
				aria-label="Anuluj udostępnianie posta"
				className="shrink-0 self-start rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				<X className="size-4" />
			</button>
		</div>
	);
}
