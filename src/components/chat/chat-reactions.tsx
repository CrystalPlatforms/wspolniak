// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	type UseMutationResult,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { AppleEmoji } from "@/components/app/apple-emoji";
import { REACTION_ORDER } from "@/components/app/reaction-config";
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

/**
 * Reakcje jednej wiadomości zcache'a CHAT_REACTIONS_KEY (F5 #156: współdzielone
 * przez pasek pod bąbelkiem i context menu). Świeżość sterują WS + invalidate.
 */
export function useChatReactions(messageId: string): ChatReactionItem[] {
	const { data: all = [] } = useQuery({
		queryKey: CHAT_REACTIONS_KEY,
		queryFn: fetchChatReactions,
		staleTime: Number.POSITIVE_INFINITY,
	});
	return all.filter((item) => item.messageId === messageId);
}

/**
 * Toggle reakcji z optymistycznym update'em cache'a (Reactions 3.0: używany
 * przez pill „Zareaguj" w menu bąbelka). Limit jednej reakcji na usera — wybór
 * innego typu zastępuje obecną; rollback przy błędzie.
 */
export function useToggleChatReaction(
	messageId: string,
	currentUserId: string,
	currentUserName: string,
): UseMutationResult<
	{ data: { action: string } },
	Error,
	ReactionType,
	{ previous: ChatReactionItem[] | undefined }
> {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (reaction: ReactionType) => toggleReactionRequest(messageId, reaction),
		onMutate: (reaction): { previous: ChatReactionItem[] | undefined } => {
			const previous = queryClient.getQueryData<ChatReactionItem[]>(CHAT_REACTIONS_KEY);
			// „Moja" reakcja czytana z cache'a (nie z closure'a renderu) — zawsze świeża.
			const mine = (previous ?? []).find(
				(item) => item.messageId === messageId && item.userId === currentUserId,
			);
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
			return { previous };
		},
		onError: (_error, _reaction, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(CHAT_REACTIONS_KEY, context.previous);
			}
		},
	});
}

export interface ChatWhoReactedDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Reakcje JEDNEJ wiadomości (filtr po messageId robi wywołujący). */
	reactions: ChatReactionItem[];
	/** Konkretny typ = jedna lista (pasek F4); null = wszystkie typy pogrupowane (menu F5). */
	type: ReactionType | null;
}

/**
 * Dialog „Kto zareagował" (F4 #155, rozszerzony w F5 #156 o tryb wszystkich
 * typów): chipsy z imionami; przy type=null sekcje per typ z ikoną konfigu.
 */
export function ChatWhoReactedDialog({
	open,
	onOpenChange,
	reactions,
	type,
}: ChatWhoReactedDialogProps) {
	// Sekcje w stałej kolejności konfigu; type=null → wszystkie niepuste typy.
	const sections = (type === null ? REACTION_ORDER : [type])
		.map((sectionType) => ({
			type: sectionType,
			people: reactions.filter((item) => item.reaction === sectionType),
		}))
		.filter((section) => section.people.length > 0);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="text-center">
						{type !== null ? (
							<AppleEmoji name={type} size={24} className="mx-auto mb-1 block" />
						) : null}
						Kto zareagował
					</DialogTitle>
					<DialogDescription className="sr-only">
						Lista użytkowników którzy zareagowali
					</DialogDescription>
				</DialogHeader>
				<div>
					{sections.length === 0 ? (
						<p className="text-center text-muted-foreground">Brak reakcji</p>
					) : (
						sections.map((section) => {
							return (
								<div key={section.type} className="flex flex-col items-center gap-2">
									{type === null ? <AppleEmoji name={section.type} size={20} /> : null}
									<div className="flex flex-wrap items-center justify-center gap-2">
										{section.people.map((item) => (
											<span
												key={`${item.userId}`}
												className="rounded-md bg-muted px-2 py-1 text-sm text-foreground"
											>
												{item.user?.name ?? "Nieznany"}
											</span>
										))}
									</div>
								</div>
							);
						})
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
