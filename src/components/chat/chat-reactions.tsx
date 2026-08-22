// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { REACTION_CONFIG, REACTION_ORDER } from "@/components/app/reaction-config";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { ReactionType } from "@/db/post-reactions/table";

/** Współdzielony klucz cache listy reakcji czatu (WS + optimistic updates). */
export const CHAT_REACTIONS_KEY = ["chat", "reactions"] as const;

/** Reakcja po stronie klienta — tożsamość = trójka (messageId, userId, reaction). */
export interface ChatReactionItem {
	messageId: string;
	userId: string;
	reaction: ReactionType;
	user: { id: string; name: string } | null;
}

/** Event reakcji z DO (broadcast po toggle'u w API) lub wyliczony optymistycznie. */
export interface ChatReactionEvent {
	messageId: string;
	reaction: ReactionType;
	action: "added" | "removed";
	user: { id: string; name: string };
}

function sameTriple(item: ChatReactionItem, event: ChatReactionEvent): boolean {
	return (
		item.messageId === event.messageId &&
		item.userId === event.user.id &&
		item.reaction === event.reaction
	);
}

/**
 * Aplikuje event reakcji do listy (F4 #155): added → doklejka z dedupe po trójce
 * (własny broadcast-echo nie dubluje), removed → filtr. Czysta funkcja z stabilną
 * referencją przy braku zmian — używana przez WS handler i optymistyczną mutację.
 */
export function applyReactionEvent(
	list: ChatReactionItem[] | undefined,
	event: ChatReactionEvent,
): ChatReactionItem[] {
	const current = list ?? [];
	if (event.action === "added") {
		if (current.some((item) => sameTriple(item, event))) return current;
		return [
			...current,
			{
				messageId: event.messageId,
				userId: event.user.id,
				reaction: event.reaction,
				user: event.user,
			},
		];
	}
	// No-op (np. własne echo po optymistycznym usunięciu) → ta sama referencja.
	if (!current.some((item) => sameTriple(item, event))) return current;
	return current.filter((item) => !sameTriple(item, event));
}

async function fetchChatReactions(): Promise<ChatReactionItem[]> {
	const res = await fetch("/api/chat/reactions");
	if (!res.ok) throw new Error("Nie udało się pobrać reakcji");
	const json = (await res.json()) as { data: ChatReactionItem[] };
	return json.data;
}

async function toggleReactionRequest(messageId: string, reaction: ReactionType) {
	const res = await fetch(`/api/chat/messages/${messageId}/reactions`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ reaction }),
	});
	if (!res.ok) throw new Error("Nie udało się zareagować");
	return (await res.json()) as { data: { action: "added" | "removed" } };
}

export interface ChatReactionBarProps {
	messageId: string;
	currentUserId: string;
	currentUserName: string;
}

/** Czas życia klasy animacji (pop/fade-out) — nieco dłuższy niż animacja 200ms. */
const ANIM_CLEAR_MS = 350;

/**
 * Rząd reakcji pod bąbelkiem (F4 #155) — trzy ikony jak w feedzie, BEZ liczników.
 * Sam subskrybuje cache reakcji (filtr po messageId) — WS i optimistic updates
 * wspólnym kluczem. Tap = toggle (pop przy dodaniu, fade-out przy usunięciu);
 * przytrzymanie / prawy klik = lista kto zareagował.
 */
export function ChatReactionBar({
	messageId,
	currentUserId,
	currentUserName,
}: ChatReactionBarProps) {
	const queryClient = useQueryClient();
	const [animating, setAnimating] = useState<{
		type: ReactionType;
		kind: "pop" | "fade-out";
	} | null>(null);
	const [whoType, setWhoType] = useState<ReactionType | null>(null);

	// Świeżość cache sterują WS + invalidate po (re)connect — nie odświeżamy zegarem.
	const { data: all = [] } = useQuery({
		queryKey: CHAT_REACTIONS_KEY,
		queryFn: fetchChatReactions,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const reactions = all.filter((item) => item.messageId === messageId);

	useEffect(() => {
		if (!animating) return;
		const timer = window.setTimeout(() => setAnimating(null), ANIM_CLEAR_MS);
		return () => window.clearTimeout(timer);
	}, [animating]);

	const mutation = useMutation({
		mutationFn: (reaction: ReactionType) => toggleReactionRequest(messageId, reaction),
		onMutate: (reaction): { previous: ChatReactionItem[] | undefined } => {
			const previous = queryClient.getQueryData<ChatReactionItem[]>(CHAT_REACTIONS_KEY);
			// Limit: jedna reakcja na usera — klik innego typu zastępuje obecną.
			const mine = reactions.find((item) => item.userId === currentUserId);
			const iReacted = mine?.reaction === reaction;
			const me = { id: currentUserId, name: currentUserName };
			queryClient.setQueryData<ChatReactionItem[]>(CHAT_REACTIONS_KEY, (old) => {
				let next = old;
				if (mine && mine.reaction !== reaction) {
					next = applyReactionEvent(next, {
						messageId,
						reaction: mine.reaction,
						action: "removed",
						user: me,
					});
				}
				return applyReactionEvent(next, {
					messageId,
					reaction,
					action: iReacted ? "removed" : "added",
					user: me,
				});
			});
			setAnimating({ type: reaction, kind: iReacted ? "fade-out" : "pop" });
			return { previous };
		},
		onError: (_error, _reaction, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(CHAT_REACTIONS_KEY, context.previous);
			}
		},
	});

	const whoReacted = whoType === null ? [] : reactions.filter((item) => item.reaction === whoType);
	const whoConfig = whoType === null ? null : REACTION_CONFIG[whoType];

	return (
		<>
			<div className="flex items-center gap-0.5 px-1" data-chat-reaction-bar>
				{REACTION_ORDER.map((type) => {
					const { Icon, label, color, filled } = REACTION_CONFIG[type];
					const iReacted = reactions.some(
						(item) => item.userId === currentUserId && item.reaction === type,
					);
					const anyoneReacted = reactions.some((item) => item.reaction === type);
					const animClass =
						animating?.type === type
							? animating.kind === "pop"
								? "chat-reaction-pop"
								: "chat-reaction-fade-out"
							: "";
					return (
						<button
							key={type}
							type="button"
							data-reaction-type={type}
							data-mine={iReacted}
							aria-pressed={iReacted}
							aria-label={label}
							title={`${label} — przytrzymaj, aby zobaczyć kto zareagował`}
							onClick={() => mutation.mutate(type)}
							onContextMenu={(event) => {
								event.preventDefault();
								setWhoType(type);
							}}
							style={iReacted ? { color } : undefined}
							className={`rounded-md p-1 transition-colors hover:bg-accent ${
								iReacted || anyoneReacted ? "" : "text-muted-foreground"
							} ${animClass}`}
						>
							<Icon className="h-4 w-4" fill={iReacted && filled ? "currentColor" : "none"} />
						</button>
					);
				})}
			</div>
			<Dialog open={whoType !== null} onOpenChange={(open) => !open && setWhoType(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="text-center">
							{whoConfig ? (
								<whoConfig.Icon
									className="mx-auto size-6"
									style={{ color: whoConfig.color }}
									fill={whoConfig.filled ? "currentColor" : "none"}
								/>
							) : null}
							Kto zareagował
						</DialogTitle>
						<DialogDescription className="sr-only">
							Lista użytkowników którzy zareagowali
						</DialogDescription>
					</DialogHeader>
					<div>
						{whoReacted.length === 0 ? (
							<p className="text-center text-muted-foreground">Brak reakcji</p>
						) : (
							<div className="flex flex-wrap items-center justify-center gap-2">
								{whoReacted.map((item) => (
									<span
										key={`${item.userId}`}
										className="rounded-md bg-muted px-2 py-1 text-sm text-foreground"
									>
										{item.user?.name ?? "Nieznany"}
									</span>
								))}
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
