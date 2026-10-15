// SPDX-License-Identifier: AGPL-3.0-or-later
import type { QueryClient } from "@tanstack/react-query";
import { pollPayloadSchema } from "@/db/chat/schema";

/** Współdzielony klucz zapytania o stan ankiet (mój głos + liczniki). */
export const CHAT_POLLS_KEY = ["chat", "polls"] as const;

/**
 * Stan ankiet po stronie klienta (F2 #215): mój głos per wiadomość
 * (brak klucza = nie głosowałem) + zagregowane liczniki per opcja.
 * Głosowanie tajne — serwer nigdy nie wysyła tożsamości innych głosujących.
 */
export interface ChatPollsState {
	myVotes: Record<string, number>;
	tallies: Record<string, number[]>;
}

/** Event vote-update z DO (broadcast po każdym głosie) — same liczniki, bez nazwisk. */
export interface ChatPollVoteUpdate {
	messageId: string;
	tallies: number[];
}

async function fetchChatPolls(): Promise<ChatPollsState> {
	const res = await fetch("/api/chat/polls");
	if (!res.ok) throw new Error("Nie udało się pobrać ankiet");
	const json = (await res.json()) as { data: ChatPollsState };
	return json.data;
}

/**
 * Dokłada liczniki z broadcastu do cache'a ankiet (nadpisuje całą tablicę —
 * serwer zawsze wysyła pełne agregaty, więc nie ma dryfu przy wyścigach głosów).
 */
export function applyPollVoteUpdate(queryClient: QueryClient, update: ChatPollVoteUpdate): void {
	queryClient.setQueryData<ChatPollsState>(CHAT_POLLS_KEY, (old) => ({
		myVotes: old?.myVotes ?? {},
		tallies: { ...(old?.tallies ?? {}), [update.messageId]: update.tallies },
	}));
}

/**
 * Optymistyczny zapis własnego głosu (zanim odpowie POST) — podświetlenie
 * opcji natychmiast; odpowiedź serwera i tak nadpisze liczniki broadcastem.
 */
export function setMyPollVote(
	queryClient: QueryClient,
	messageId: string,
	optionIndex: number,
): void {
	queryClient.setQueryData<ChatPollsState>(CHAT_POLLS_KEY, (old) => ({
		myVotes: { ...(old?.myVotes ?? {}), [messageId]: optionIndex },
		tallies: old?.tallies ?? {},
	}));
}

/** Optymistyczne zdjęcie własnego głosu (toggle-off — HITL: klik w swoją opcję). */
export function clearMyPollVote(queryClient: QueryClient, messageId: string): void {
	queryClient.setQueryData<ChatPollsState>(CHAT_POLLS_KEY, (old) => {
		if (!old || !(messageId in old.myVotes)) return old;
		const myVotes = { ...old.myVotes };
		delete myVotes[messageId];
		return { myVotes, tallies: old.tallies };
	});
}

/**
 * POST głosu — odpowiedź niesie świeże liczniki (te same co broadcast) oraz
 * efektowny głos WYWOŁUJĄCEGO: liczba = zagłosowano/zmieniono, null = wycofano
 * (ponowny klik w tę samą opcję, HITL). `myVote` nie trafia do broadcastu.
 */
export interface ChatVoteResponse {
	tallies: number[];
	myVote: number | null;
}

async function voteChatPollRequest(
	messageId: string,
	optionIndex: number,
): Promise<ChatVoteResponse> {
	const res = await fetch(`/api/chat/messages/${messageId}/votes`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ optionIndex }),
	});
	if (!res.ok) throw new Error("Nie udało się zagłosować");
	const json = (await res.json()) as { data: ChatVoteResponse };
	return json.data;
}

/**
 * Payload ankiety z wiadomości — parsowany defensywnie Zodem (payload przychodzi
 * z DB jako JSON; uszkodzony kształt → null i bąbelek renderuje fallback).
 */
export function parsePollPayload(payload: unknown): { options: string[] } | null {
	const parsed = pollPayloadSchema.safeParse(payload);
	return parsed.success ? parsed.data : null;
}

export { fetchChatPolls, voteChatPollRequest };
