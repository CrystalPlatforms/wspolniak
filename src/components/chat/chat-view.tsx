// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChatBubbleMenu } from "@/components/chat/chat-bubble-menu";
import { ChatBubbleReactions } from "@/components/chat/chat-bubble-reactions";
import { useBubbleMenu } from "@/components/chat/use-bubble-menu";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { useOnlineStatus } from "@/pwa/use-online-status";
import { isNearBottom, scrollToBottom } from "./chat-scroll";
import { TypingIndicator } from "./typing-indicator";
import { appendChatMessageIfNew, removeChatMessage, useChatSocket } from "./use-chat-socket";
// Animacje czatu (bąbelki, pasek wysyłki, reakcje, menu) — klasy używane w tym
// pliku, w ChatReactionBar (menu) i w ChatBubbleMenu.
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

/** Zaznaczenie „w odpowiedzi do" nad inputem (F5 #156). */
interface ReplyDraft {
	id: string;
	text: string;
}

async function fetchChatMessages(): Promise<ChatMessageItem[]> {
	const res = await fetch("/api/chat/messages");
	if (!res.ok) throw new Error("Nie udało się pobrać wiadomości");
	const json = (await res.json()) as { data: ChatMessageItem[] };
	return json.data;
}

async function sendChatMessage(text: string, replyToId?: string): Promise<ChatMessageItem> {
	const res = await fetch("/api/chat/messages", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ text, replyToId }),
	});
	if (!res.ok) throw new Error("Nie udało się wysłać wiadomości");
	const json = (await res.json()) as { data: ChatMessageItem };
	return json.data;
}

async function deleteChatMessageRequest(messageId: string): Promise<void> {
	const res = await fetch(`/api/chat/messages/${messageId}`, { method: "DELETE" });
	if (!res.ok) throw new Error("Nie udało się usunąć wiadomości");
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

/** Czas animacji zniknięcia bąbelka (F6 #157) — po nim sprzątamy cache. */
const BUBBLE_OUT_MS = 230;

/** Czas podświetlenia oryginału po kliknięciu quote (#165) — „świeci 7sec". */
const HIGHLIGHT_MS = 7000;

/** Wiadomość w locie (optymistyczna) — Bubble visible natychmiast, status steruje paskiem. */
interface PendingMessage {
	clientId: string;
	text: string;
	replyToId?: string;
	replyText: string | null;
	status: "sending" | "error";
}

interface ChatViewProps {
	currentUserId: string;
	/** Imię usera z sesji — trafia do optymistycznych reakcji (lista kto-zareagował). */
	currentUserName: string;
	/** Admin może usuwać także cudze wiadomości (F6 #157) — steruje itemem „Usuń". */
	isAdmin: boolean;
}

/** Widok czatu rodzinnego (F1–F6): lista 24h, optymistyczna wysyłka, live WS,
 *  reakcje, typing, context menu (Odpowiedz/Kopiuj/Info/reakcje) i usuwanie. */
export function ChatView({ currentUserId, currentUserName, isAdmin }: ChatViewProps) {
	const queryClient = useQueryClient();
	// Offline (F8 #159): banner + blokada wysyłki i reakcji (bez kolejowania — PRD).
	const online = useOnlineStatus();
	const { data: messages } = useQuery({
		queryKey: CHAT_MESSAGES_KEY,
		queryFn: fetchChatMessages,
	});
	const [draft, setDraft] = useState("");
	const [pending, setPending] = useState<PendingMessage[]>([]);
	// Reply (F5): quote nad inputem; wysyłka dokłada replyToId do POST-a.
	const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);
	// Usuwanie (F6): id w trakcie animacji zniknięcia — renderuje chat-bubble-out.
	const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(new Set());

	// Live delivery (F2): WS dokleja wiadomości do cache'a + refetch po reconnect.
	// Typing (F3): kropki „ktoś pisze…" + throttlowane powiadomienia o własnym pisaniu.
	// Delete (F6): event usunięcia → animacja, po niej sprzątanie cache.
	const { isSomeoneTyping, notifyTyping } = useChatSocket({ onDelete: handleDeletedMessage });

	// Context menu (F5): long-press / prawy klik / Enter — handlery wpięte w bąbelki.
	const {
		menu,
		closeMenu,
		handlePointerDown,
		handlePointerMove,
		cancelPress,
		handleContextMenu,
		handleKeyDown,
	} = useBubbleMenu();

	const containerRef = useRef<HTMLDivElement>(null);
	const prevIdsRef = useRef<Set<string> | null>(null);
	const prevPendingCountRef = useRef(0);
	// Czy lista już raz się załadowała (pierwsza paczka = historia, nie „live").
	const hadDataRef = useRef(false);
	// Id wiadomości, które przyszły na żywo — tylko one dostają slide-in.
	const [animatedIds, setAnimatedIds] = useState<ReadonlySet<string>>(new Set());
	// F8 #159 HITL: czy user jest przy dniu listy? Steruje przyciskowi „↓ Zjedź
	// na sam dół" — widocznemu ZAWSZE po przewinięciu w górę (nie tylko przy
	// nowych wiadomościach; zgłoszenie usera z QA animacji).
	const [nearBottom, setNearBottom] = useState(true);
	// #165: id wiadomości podświetlonej po kliknięciu quote (niebieska poświata).
	const [highlightedId, setHighlightedId] = useState<string | null>(null);
	const highlightTimerRef = useRef<number | undefined>(undefined);
	// Timer poświaty gasi ją po 7s; sprzątamy go przy odmontowaniu czatu.
	useEffect(() => () => window.clearTimeout(highlightTimerRef.current), []);

	const list = messages ?? [];
	const menuMessage = menu ? list.find((message) => message.id === menu.messageId) : undefined;

	useEffect(() => {
		const ids = new Set(list.map((message) => message.id));
		const prev = prevIdsRef.current;
		// Pierwsze niepuste dane = załadowanie historii: scroll bez animacji.
		// „Incoming" liczymy tylko gdy lista była już załadowana (live delivery).
		const isFirstData = !hadDataRef.current && list.length > 0;
		const incoming = prev && !isFirstData ? list.filter((message) => !prev.has(message.id)) : [];
		prevIdsRef.current = ids;
		if (list.length > 0) hadDataRef.current = true;

		const pendingGrew = pending.length > prevPendingCountRef.current;
		prevPendingCountRef.current = pending.length;

		if (incoming.length > 0) {
			setAnimatedIds((old) => new Set([...old, ...incoming.map((message) => message.id)]));
		}

		if (pendingGrew || incoming.length > 0 || isFirstData) {
			const el = containerRef.current;
			if (!el) return;
			// Własna wysyłka i otwarcie czatu zawsze lądują na dole; cudze live —
			// tylko gdy user jest przy dniu. Daleko od dna? Bez auto-scrolla —
			// przycisk „↓ Zjedź na sam dół" steruje już sama pozycja scrolla (onScroll).
			if (pendingGrew || isFirstData || isNearBottom(el)) {
				scrollToBottom(el);
				setNearBottom(true);
			}
		}
	}, [list, pending]);

	const sendMutation = useMutation({
		mutationFn: (vars: { text: string; replyToId?: string; replyText: string | null }) =>
			sendChatMessage(vars.text, vars.replyToId),
		onMutate: (vars): { clientId: string } => {
			// Optymistyczny bąbelek: natychmiast, jeszcze przed POST-em. Quote
			// (replyText) w locie z lokalnego snapshotu — po potwierdzeniu z API.
			const clientId = `temp-${crypto.randomUUID()}`;
			setPending((prev) => [
				...prev,
				{
					clientId,
					text: vars.text,
					replyToId: vars.replyToId,
					replyText: vars.replyToId ? vars.replyText : null,
					status: "sending",
				},
			]);
			return { clientId };
		},
		onSuccess: (message, _vars, context) => {
			// Potwierdzenie: bąbelek w locie znika, do listy trafia zapisana wiadomość.
			// Dedupe: broadcast WS często wygra wyścig z tą odpowiedzią (ten sam id).
			setPending((prev) => prev.filter((p) => p.clientId !== context?.clientId));
			appendChatMessageIfNew(queryClient, message);
		},
		onError: (_error, _vars, context) => {
			// Błąd: bąbelek zostaje, pasek czerwienieje, pojawia się „Ponów”.
			setPending((prev) =>
				prev.map((p) => (p.clientId === context?.clientId ? { ...p, status: "error" } : p)),
			);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: deleteChatMessageRequest,
		// Własne echo WS przyjdzie też — podwójne wywołanie jest idempotentne.
		onSuccess: (_data, messageId) => handleDeletedMessage(messageId),
		onError: () => toast.error("Nie udało się usunąć wiadomości"),
	});

	/** F6: animuj zniknięcie (chat-bubble-out), po czasie animacji sprzątnij cache. */
	function handleDeletedMessage(messageId: string) {
		setRemovingIds((prev) => {
			if (prev.has(messageId)) return prev;
			const next = new Set(prev);
			next.add(messageId);
			return next;
		});
		window.setTimeout(() => {
			removeChatMessage(queryClient, messageId);
			setRemovingIds((prev) => {
				const next = new Set(prev);
				next.delete(messageId);
				return next;
			});
		}, BUBBLE_OUT_MS);
	}

	function handleReply(message: ChatMessageItem) {
		setReplyTo({ id: message.id, text: message.text });
	}

	function handleSend() {
		const text = draft.trim();
		if (!text || sendMutation.isPending || !online) return;
		const reply = replyTo;
		setDraft("");
		setReplyTo(null);
		sendMutation.mutate({ text, replyToId: reply?.id, replyText: reply?.text ?? null });
	}

	function handleRetry(message: PendingMessage) {
		setPending((prev) => prev.filter((p) => p.clientId !== message.clientId));
		sendMutation.mutate({
			text: message.text,
			replyToId: message.replyToId,
			replyText: message.replyText,
		});
	}

	function handleJumpToNew() {
		const el = containerRef.current;
		if (el) scrollToBottom(el);
		// Optymistycznie — eventy smooth scrolla potwierdzą stan (onScroll).
		setNearBottom(true);
	}

	/** Klik w quote (F5): scroll do żywego oryginału; wygasły/usunięty = no-op,
	 *  snapshot quote zostaje na miejscu. #165: żywy oryginał dostaje niebieską
	 *  poświatę (chat-highlight) na 7 sekund. */
	function scrollToMessage(messageId: string | null) {
		if (!messageId) return;
		const target = containerRef.current?.querySelector(`[data-message-id="${messageId}"]`);
		if (!target) return;
		target.scrollIntoView({ behavior: "smooth", block: "center" });
		// #165: podświetl oryginał i zapal licznik 7s (restart przy kolejnym kliknięciu).
		window.clearTimeout(highlightTimerRef.current);
		setHighlightedId(messageId);
		highlightTimerRef.current = window.setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
	}

	// Przy dużej liczbie wiadomości renderujemy tylko najnowsze — szybciej na telefonach.
	const hasMany = list.length > MANY_MESSAGES_THRESHOLD;
	const visible = hasMany ? list.slice(-MAX_VISIBLE_MESSAGES) : list;

	return (
		<div className="flex h-full flex-col bg-background">
			<div className="relative flex-1 overflow-hidden">
				<div
					ref={containerRef}
					data-chat-scroll
					className="h-full overflow-y-auto px-4 py-4"
					onScroll={(event) => setNearBottom(isNearBottom(event.currentTarget))}
				>
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
							// Slide-in dostają tylko wiadomości przybrane na żywo (nie start listy).
							const slideIn = side === "other" && animatedIds.has(message.id);
							const removing = removingIds.has(message.id);
							return (
								<li
									key={message.id}
									data-message-id={message.id}
									data-side={side}
									className={`flex w-full flex-col ${side === "own" ? "items-end" : "items-start"} ${isFirstOfGroup ? "mt-3" : "mt-0.5"} ${slideIn ? "chat-bubble-in" : ""} ${removing ? "chat-bubble-out" : ""} ${message.id === highlightedId ? "chat-highlight" : ""} first:mt-0`}
								>
									{side === "other" && isFirstOfGroup ? (
										<span className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">
											{message.author.name}
										</span>
									) : null}
									{message.replyToId ? (
										// Quote odpowiedzi (F5): sam tekst (bez autora), snapshot z serwera.
										<button
											type="button"
											data-reply-quote
											aria-label="Przewiń do cytowanej wiadomości"
											onClick={() => scrollToMessage(message.replyToId)}
											className="mb-0.5 max-w-[85%] truncate rounded-lg border-l-2 border-primary/60 bg-muted/60 px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
										>
											{message.replyText}
										</button>
									) : null}
									<div
										role="button"
										tabIndex={0}
										aria-haspopup="menu"
										aria-label="Menu wiadomości"
										onPointerDown={(event) => handlePointerDown(message, event)}
										onPointerMove={handlePointerMove}
										onPointerUp={cancelPress}
										onPointerCancel={cancelPress}
										onPointerLeave={cancelPress}
										onContextMenu={(event) => handleContextMenu(message, event)}
										onKeyDown={(event) => handleKeyDown(message, event)}
										className={`flex max-w-[85%] cursor-default items-end gap-2 rounded-2xl px-3 py-2 [-webkit-touch-callout:none] select-none ${side === "own" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground"}`}
									>
										{/* Małe emoji od innych — od zewnętrznego rogu dymka. */}
										{side === "other" ? (
											<ChatBubbleReactions messageId={message.id} currentUserId={currentUserId} />
										) : null}
										<p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
										<span className="shrink-0 text-[10px] opacity-60">
											{formatChatTime(message.createdAt)}
										</span>
										{side === "own" ? (
											<ChatBubbleReactions messageId={message.id} currentUserId={currentUserId} />
										) : null}
									</div>
									{/* Reakcje NA dymku (rewizja HITL #161 — zmiana decyzji
									    z F5); pill „Zareaguj" zakotwiczony w wiadomości. */}
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
							{message.replyToId ? (
								// Quote odpowiedzi w locie — tekst z lokalnego snapshotu (F5).
								<div className="mb-0.5 max-w-[85%] truncate rounded-lg border-l-2 border-primary/60 bg-muted/60 px-2 py-1 text-right text-xs text-muted-foreground">
									{message.replyText}
								</div>
							) : null}
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
									onClick={() => handleRetry(message)}
									className="mt-1 text-xs font-medium text-destructive hover:underline"
								>
									Ponów
								</button>
							) : null}
						</div>
					))}
				</div>
				{!nearBottom ? (
					<button
						type="button"
						onClick={handleJumpToNew}
						className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background px-4 py-1.5 text-xs font-medium text-foreground shadow-md transition-colors hover:bg-accent"
					>
						↓ Zjedź na sam dół
					</button>
				) : null}
			</div>
			{menu && menuMessage ? (
				<ChatBubbleMenu
					message={menuMessage}
					position={{ x: menu.x, y: menu.y }}
					currentUserId={currentUserId}
					currentUserName={currentUserName}
					isAdmin={isAdmin}
					reactionsDisabled={!online}
					onReply={handleReply}
					onDelete={(messageId) => deleteMutation.mutate(messageId)}
					onClose={closeMenu}
				/>
			) : null}
			{!online && (
				// F8 #159: lokalny banner czatu (globalny „Brak połączenia" z PwaShell
				// zostaje) — informuje, że wysyłka i reakcje są zablokowane.
				<div
					data-chat-offline
					className="flex items-center justify-center gap-2 border-t border-border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground"
				>
					<MessageSquare className="size-4" />
					Jesteś offline
				</div>
			)}
			<form
				onSubmit={(event) => {
					event.preventDefault();
					handleSend();
				}}
				className="p-3 sm:mb-1"
			>
				<div className="mx-auto flex max-w-2xl flex-col">
					{/* F3: anonimowy wskaźnik nad inputem — zawsze zamontowany (fade, bez skoku layoutu). */}
					<TypingIndicator visible={isSomeoneTyping} />
					{replyTo ? (
						// Podgląd odpowiedzi nad inputem (F5) — quote + anulowanie.
						<div
							data-reply-preview
							className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2"
						>
							<div className="min-w-0 flex-1">
								<p className="text-xs font-medium text-muted-foreground">Odpowiedź</p>
								<p className="truncate text-sm text-foreground">{replyTo.text}</p>
							</div>
							<button
								type="button"
								onClick={() => setReplyTo(null)}
								aria-label="Anuluj odpowiedź"
								className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							>
								<X className="size-4" />
							</button>
						</div>
					) : null}
					<div className="flex items-center gap-2">
						<input
							value={draft}
							onChange={(event) => {
								setDraft(event.target.value);
								notifyTyping();
							}}
							maxLength={MAX_MESSAGE_LENGTH}
							placeholder="Wiadomość…"
							aria-label="Wiadomość"
							autoComplete="off"
							disabled={!online}
							className="flex-1 rounded-full border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						<Button
							type="submit"
							size="icon"
							className="h-11 w-11 shrink-0 rounded-full"
							aria-label="Wyślij"
							disabled={!draft.trim() || sendMutation.isPending || !online}
						>
							<SendHorizontal className="h-5 w-5" />
						</Button>
					</div>
				</div>
			</form>
		</div>
	);
}
