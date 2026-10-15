// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";
import { reactionTypes } from "@/db/post-reactions/table";

/** Rodzaje wiadomości czatu (F2 #215, F3 #216) — nowy default to zwykły tekst. */
export const chatMessageKinds = ["text", "poll", "location"] as const;
export type ChatMessageKind = (typeof chatMessageKinds)[number];

/** Payload ankiety (F2 #215): 2–6 niepustych opcji po maks. 100 znaków. */
export const pollPayloadSchema = z.object({
	options: z
		.array(
			z
				.string()
				.trim()
				.min(1, "Opcja nie może być pusta")
				.max(100, "Opcja może mieć maksymalnie 100 znaków"),
		)
		.min(2, "Ankieta musi mieć co najmniej 2 opcje")
		.max(6, "Ankieta może mieć maksymalnie 6 opcji"),
});

export type PollPayload = z.infer<typeof pollPayloadSchema>;

/**
 * Payload lokalizacji (F3 #216): współrzędne w zakresach geograficznych +
 * opcjonalna etykieta (best-effort — bez geokodowania, współrzędne zawsze są).
 */
export const locationPayloadSchema = z.object({
	lat: z.number().min(-90, "Szerokość poza zakresem").max(90, "Szerokość poza zakresem"),
	lng: z.number().min(-180, "Długość poza zakresem").max(180, "Długość poza zakresem"),
	label: z
		.string()
		.trim()
		.min(1)
		.max(200, "Etykieta może mieć maksymalnie 200 znaków")
		.optional(),
});

export type LocationPayload = z.infer<typeof locationPayloadSchema>;

/** Payload wiadomości — unia kształtów per kind (kolejne dojdą w F4–F5). */
export type ChatMessagePayload = PollPayload | LocationPayload;

/** Wspólne pole tekstowe: treść wiadomości lub pytanie ankiety (kolumna `text`). */
const chatMessageTextSchema = z
	.string()
	.trim()
	.min(1, "Wiadomość nie może być pusta")
	.max(200, "Wiadomość może mieć maksymalnie 200 znaków");

/** Reply (F5 #156) — id oryginału; snapshot tekstu robi serwer przy wysyłce. */
const chatReplyToIdSchema = z.string().min(1).optional();

const chatTextMessageSchema = z.object({
	kind: z.literal("text"),
	text: chatMessageTextSchema,
	replyToId: chatReplyToIdSchema,
});

const chatPollMessageSchema = z.object({
	kind: z.literal("poll"),
	// Pytanie ankiety żyje w kolumnie `text` (quote odpowiedzi i tak je snapshotuje).
	text: chatMessageTextSchema,
	replyToId: chatReplyToIdSchema,
	payload: pollPayloadSchema,
});

const chatLocationMessageSchema = z.object({
	kind: z.literal("location"),
	// Kolumna `text` jest NOT NULL — dla lokalizacji to etykieta albo domyślny
	// opis (służy też jako snapshot quote przy odpowiedzi).
	text: chatMessageTextSchema,
	replyToId: chatReplyToIdSchema,
	payload: locationPayloadSchema,
});

/**
 * Wysyłka wiadomości (F1 #152 + F2 #215): union po `kind`. Brak `kind` = zwykły
 * tekst (wsteczna kompatybilność z klientami sprzed ankiet) — dokleja preprocess.
 * Zod v4 nie przyjmuje brakującego dyskryminatora mimo `.default()`, więc domyślne
 * `text` wstawia preprocess przed unionem.
 */
export const createChatMessageSchema = z.preprocess(
	(raw) =>
		typeof raw === "object" && raw !== null && !("kind" in raw)
			? { ...(raw as Record<string, unknown>), kind: "text" }
			: raw,
	z.discriminatedUnion("kind", [
		chatTextMessageSchema,
		chatPollMessageSchema,
		chatLocationMessageSchema,
	]),
);

export type CreateChatMessageRequest = z.infer<typeof createChatMessageSchema>;

/** Głos w ankiecie (F2 #215) — indeks opcji; zakres wobec liczby opcji pilnuje domena. */
export const voteChatPollSchema = z.object({
	optionIndex: z
		.number()
		.int("Głos musi być indeksem opcji")
		.min(0, "Nieprawidłowa opcja")
		.max(5, "Nieprawidłowa opcja"),
});

export type VoteChatPollRequest = z.infer<typeof voteChatPollSchema>;

/** Toggle reakcji (F4 #155) — te same 3 typy co feed; nieznany typ → 400 w API. */
export const toggleChatReactionSchema = z.object({
	reaction: z.enum(reactionTypes),
});

export type ToggleChatReactionRequest = z.infer<typeof toggleChatReactionSchema>;
