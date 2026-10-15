// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { ChatMessageItem } from "@/components/chat/chat-view";
import {
	applyPollVoteUpdate,
	CHAT_POLLS_KEY,
	clearMyPollVote,
	fetchChatPolls,
	parsePollPayload,
	setMyPollVote,
	voteChatPollRequest,
} from "./chat-polls";
import { ChatBubbleText } from "./chat-bubble-text";

/** „1 głos / 2–4 głosy / 5+ głosów" — polska odmiana dla podsumowania ankiety. */
function pollVotesLabel(total: number): string {
	if (total === 1) return "1 głos";
	const mod10 = total % 10;
	const mod100 = total % 100;
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${total} głosy`;
	return `${total} głosów`;
}

/**
 * Interaktywny bąbelek ankiety (F2 #215): pytanie + opcje z procentami. Klik w
 * opcję = głos, klik w inną = zmiana głosu (atomic upsert po stronie serwera).
 * Wyniki żyją w cache ankiet (CHAT_POLLS_KEY) — live podłączony przez WS
 * (event vote-update) i refetch po reconnect. Głosowanie tajne: UI pokazuje
 * wyłącznie procenty i łączną liczbę głosów — nigdy nazwisk.
 * Uszkodzony payload → fallback na zwykły tekst (nie powinno się zdarzyć —
 * serwer waliduje Zodem — ale bąbelek nie może wysypać listy).
 */
export function ChatBubblePoll({ message, own }: { message: ChatMessageItem; own: boolean }) {
	const queryClient = useQueryClient();
	const { data: polls } = useQuery({ queryKey: CHAT_POLLS_KEY, queryFn: fetchChatPolls });
	const payload = parsePollPayload(message.payload);
	// Defensywne ?.: cache jest wypełniany z kilku źródeł (fetch, broadcast,
	// optymistyczny głos) — brak klucza nie może wysypać bąbelka.
	const tallies = polls?.tallies?.[message.id];
	const myVote = polls?.myVotes?.[message.id];

	const voteMutation = useMutation({
		mutationFn: (optionIndex: number) => voteChatPollRequest(message.id, optionIndex),
		// Optymistycznie: klik w swoją opcję zdejmuje głos, w inną — ustawia.
		// Serwer i tak potwierdzi (broadcast nadpisze liczniki idempotentnie).
		onMutate: (optionIndex) => {
			if (myVote === optionIndex) clearMyPollVote(queryClient, message.id);
			else setMyPollVote(queryClient, message.id, optionIndex);
		},
		onSuccess: ({ tallies, myVote: effectiveVote }) => {
			applyPollVoteUpdate(queryClient, { messageId: message.id, tallies });
			// null = głos wycofany (toggle) — zdjęcie podświetlenia.
			if (effectiveVote === null) clearMyPollVote(queryClient, message.id);
			else setMyPollVote(queryClient, message.id, effectiveVote);
		},
		onError: () => {
			toast.error("Nie udało się zagłosować");
			// Resynchronizacja stanu (mój głos + liczniki) z serwera.
			void queryClient.invalidateQueries({ queryKey: CHAT_POLLS_KEY });
		},
	});

	if (!payload) {
		return <ChatBubbleText text={message.text} own={own} />;
	}

	const total = tallies?.reduce((sum, count) => sum + count, 0) ?? 0;

	return (
		<div data-poll-bubble className="flex min-w-40 flex-col gap-1.5">
			<p className="whitespace-pre-wrap break-words text-sm font-medium">{message.text}</p>
			{payload.options.map((option, index) => {
				const count = tallies?.[index] ?? 0;
				const pct = total > 0 ? Math.round((count / total) * 100) : 0;
				const mine = myVote === index;
				return (
					<button
						key={option}
						type="button"
						onClick={() => voteMutation.mutate(index)}
						disabled={voteMutation.isPending}
						aria-pressed={mine}
						aria-label={`Głosuj na: ${option}`}
						className={`flex w-full items-center gap-2 rounded-full bg-background px-2.5 py-1 text-left text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-60 ${mine ? "ring-2 ring-primary" : ""}`}
					>
						{mine ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" /> : null}
						<span className="min-w-0 flex-1 break-words">{option}</span>
						<span className="shrink-0 font-medium tabular-nums">{pct}%</span>
					</button>
				);
			})}
			<p className="text-[10px] opacity-60">{pollVotesLabel(total)}</p>
		</div>
	);
}
