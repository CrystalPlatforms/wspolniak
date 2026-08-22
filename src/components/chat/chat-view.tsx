// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, SendHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import "./chat-bubble.css";

/** Współdzielony klucz zapytania o listę wiadomości czatu. */
export const CHAT_MESSAGES_KEY = ["chat", "messages"] as const;

/** Wiadomość czatu po stronie klienta — daty przychodzą z API jako ISO string (JSON). */
export interface ChatMessageItem {
	id: string;
	authorId: string;
	text: string;
	replyToId: string | null;
	replyText: string | null;
	createdAt: string;
	expiresAt: string;
	author: { id: string; name: string };
}

async function fetchChatMessages(): Promise<ChatMessageItem[]> {
	const res = await fetch("/api/chat/messages");
	if (!res.ok) throw new Error("Nie udało się pobrać wiadomości");
	const json = (await res.json()) as { data: ChatMessageItem[] };
	return json.data;
}

async function sendChatMessage(text: string): Promise<ChatMessageItem> {
	const res = await fetch("/api/chat/messages", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ text }),
	});
	if (!res.ok) throw new Error("Nie udało się wysłać wiadomości");
	const json = (await res.json()) as { data: ChatMessageItem };
	return json.data;
}

/** Godzina w formacie Telegrama: HH:MM (pl-PL). */
function formatChatTime(iso: string): string {
	return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

/** Renderujemy maksymalnie tyle najnowszych wiadomości (decyzja PRD: „dużo” = >50). */
const MAX_VISIBLE_MESSAGES = 50;

/** Granica, powyżej której pojawia się loader + notice o ukrytych starszych wiadomości. */
const MANY_MESSAGES_THRESHOLD = 50;

/** Maksymalna długość wiadomości — limit PRD, egzekwowany też przez API (Zod). */
const MAX_MESSAGE_LENGTH = 200;

/** Wiadomość w locie (optymistyczna) — Bubble visible natychmiast, status steruje paskiem. */
interface PendingMessage {
	clientId: string;
	text: string;
	status: "sending" | "error";
}

interface ChatViewProps {
	currentUserId: string;
}

/** Widok czatu rodzinnego (F1): lista z 24h + optymistyczna wysyłka. Autoryzacja w layoutcie /app. */
export function ChatView({ currentUserId }: ChatViewProps) {
	const queryClient = useQueryClient();
	const { data: messages } = useQuery({
		queryKey: CHAT_MESSAGES_KEY,
		queryFn: fetchChatMessages,
	});
	const [draft, setDraft] = useState("");
	const [pending, setPending] = useState<PendingMessage[]>([]);

	const sendMutation = useMutation({
		mutationFn: sendChatMessage,
		onMutate: (text) => {
			// Optymistyczny bąbelek: natychmiast, jeszcze przed POST-em.
			const clientId = `temp-${crypto.randomUUID()}`;
			setPending((prev) => [...prev, { clientId, text, status: "sending" }]);
			return { clientId };
		},
		onSuccess: (message, _text, context) => {
			// Potwierdzenie: bąbelek w locie znika, do listy trafia zapisana wiadomość.
			setPending((prev) => prev.filter((p) => p.clientId !== context?.clientId));
			queryClient.setQueryData<ChatMessageItem[]>(CHAT_MESSAGES_KEY, (old) => [
				...(old ?? []),
				message,
			]);
		},
		onError: (_error, _text, context) => {
			// Błąd: bąbelek zostaje, pasek czerwienieje, pojawia się „Ponów”.
			setPending((prev) =>
				prev.map((p) => (p.clientId === context?.clientId ? { ...p, status: "error" } : p)),
			);
		},
	});

	function handleSend() {
		const text = draft.trim();
		if (!text || sendMutation.isPending) return;
		setDraft("");
		sendMutation.mutate(text);
	}

	function handleRetry(clientId: string, text: string) {
		setPending((prev) => prev.filter((p) => p.clientId !== clientId));
		sendMutation.mutate(text);
	}

	const list = messages ?? [];
	// Przy dużej liczbie wiadomości renderujemy tylko najnowsze — szybciej na telefonach.
	const hasMany = list.length > MANY_MESSAGES_THRESHOLD;
	const visible = hasMany ? list.slice(-MAX_VISIBLE_MESSAGES) : list;

	return (
		<div className="flex h-full flex-col bg-background">
			<div className="flex-1 overflow-y-auto px-4 py-4">
				{hasMany ? (
					// Starsze wiadomości z 24h istnieją, ale są ukryte — loader + notice u góry.
					// (Loader sam niesie rolę status — <output aria-label="Ładowanie">.)
					<div className="mb-2 flex flex-col items-center gap-1">
						<Loader size={2} />
						<p className="text-xs text-muted-foreground">
							Starsze wiadomości z ostatniej doby są ukryte — znikają po 24 godzinach
						</p>
					</div>
				) : null}
				{visible.length === 0 && pending.length === 0 ? (
					<div className="flex h-full flex-col items-center justify-center gap-2 text-center">
						<MessageSquare className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
						<p className="text-muted-foreground">Nie ma jeszcze żadnych wiadomości</p>
						<p className="text-sm text-muted-foreground">Napisz pierwszą do rodziny</p>
					</div>
				) : null}
				<ol className="flex flex-col" aria-label="Wiadomości">
					{visible.map((message, index) => {
						const side = message.authorId === currentUserId ? "own" : "other";
						// Grupa = kolejne wiadomości tego samego autora; imię tylko na pierwszej.
						const isFirstOfGroup = visible[index - 1]?.authorId !== message.authorId;
						return (
							<li
								key={message.id}
								data-side={side}
								className={`flex w-full flex-col ${side === "own" ? "items-end" : "items-start"} ${isFirstOfGroup ? "mt-3" : "mt-0.5"} first:mt-0`}
							>
								{side === "other" && isFirstOfGroup ? (
									<span className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">
										{message.author.name}
									</span>
								) : null}
								<div
									className={`flex max-w-[85%] items-end gap-2 rounded-2xl px-3 py-2 ${side === "own" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground"}`}
								>
									<p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
									<span className="shrink-0 text-[10px] opacity-60">
										{formatChatTime(message.createdAt)}
									</span>
								</div>
							</li>
						);
					})}
				</ol>
				{pending.map((message) => (
					// Bąbelek w locie — zawsze własny, zjeżdża z dołu (Telegram), pasek pod nim.
					<div
						key={message.clientId}
						data-side="own"
						className="chat-bubble-in mt-0.5 flex w-full flex-col items-end"
					>
						<div
							className={`flex max-w-[85%] items-end gap-2 rounded-2xl rounded-br-md px-3 py-2 bg-primary text-primary-foreground ${message.status === "error" ? "opacity-80 ring-1 ring-destructive" : ""}`}
						>
							<p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
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
								onClick={() => handleRetry(message.clientId, message.text)}
								className="mt-1 text-xs font-medium text-destructive hover:underline"
							>
								Ponów
							</button>
						) : null}
					</div>
				))}
			</div>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					handleSend();
				}}
				className="border-t border-border bg-background p-3 sm:mb-1"
			>
				<div className="mx-auto flex max-w-2xl items-center gap-2">
					<input
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						maxLength={MAX_MESSAGE_LENGTH}
						placeholder="Wiadomość…"
						aria-label="Wiadomość"
						autoComplete="off"
						className="flex-1 rounded-full border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
					<Button
						type="submit"
						size="icon"
						className="h-11 w-11 shrink-0 rounded-full"
						aria-label="Wyślij"
						disabled={!draft.trim() || sendMutation.isPending}
					>
						<SendHorizontal className="h-5 w-5" />
					</Button>
				</div>
			</form>
		</div>
	);
}
