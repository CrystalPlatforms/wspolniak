// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";
import { reactionTypes } from "@/db/post-reactions/table";

/** Rodzaje wiadomości czatu (#215, #216, #217, #218) — nowy default to zwykły tekst. */
export const chatMessageKinds = ["text", "poll", "location", "attachments", "post"] as const;
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
	label: z.string().trim().min(1).max(200, "Etykieta może mieć maksymalnie 200 znaków").optional(),
});

export type LocationPayload = z.infer<typeof locationPayloadSchema>;

/** Limity załączników (F4 #217): 5 plików × 19 MB, wideo wykluczone (PRD #201). */
export const MAX_CHAT_ATTACHMENTS = 5;
export const MAX_CHAT_ATTACHMENT_BYTES = 19 * 1024 * 1024;

/**
 * Metadane załącznika (F4 #217): klucz obiektu R2 (goły UUID — unikasz ścieżek),
 * oryginalna nazwa pliku, rozmiar i typ MIME. Wideo blokuje `refine` —
 * stojąca reguła projektu: wideo tylko przez YouTube.
 */
export const attachmentMetaSchema = z
	.object({
		key: z
			.string()
			.regex(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
				"Nieprawidłowy klucz załącznika",
			),
		name: z
			.string()
			.trim()
			.min(1, "Nazwa pliku nie może być pusta")
			.max(200, "Nazwa pliku może mieć maksymalnie 200 znaków"),
		size: z.number().int().positive().max(MAX_CHAT_ATTACHMENT_BYTES, "Plik przekracza limit 19 MB"),
		mimeType: z
			.string()
			.min(1)
			.max(100)
			.refine((type) => !type.startsWith("video/"), "Pliki wideo nie są obsługiwane"),
	})
	.strict();

export type AttachmentMeta = z.infer<typeof attachmentMetaSchema>;

/** Payload załączników (F4 #217): 1–5 metadanych; tekst wiadomości to podpis (kolumna `text`). */
export const attachmentsPayloadSchema = z
	.object({
		attachments: z
			.array(attachmentMetaSchema)
			.min(1, "Wiadomość z załącznikami wymaga co najmniej 1 pliku")
			.max(MAX_CHAT_ATTACHMENTS, `Możesz załączyć maksymalnie ${MAX_CHAT_ATTACHMENTS} plików`),
	})
	.strict();

export type AttachmentsPayload = z.infer<typeof attachmentsPayloadSchema>;

/** Payload udostępnionego posta (F5 #218): samo id — karta re-resolvuje post przy każdym odczycie. */
export const postPayloadSchema = z
	.object({
		postId: z.string().min(1).max(64),
	})
	.strict();

export type PostPayload = z.infer<typeof postPayloadSchema>;

/** Payload wiadomości — unia kształtów per kind. */
export type ChatMessagePayload = PollPayload | LocationPayload | AttachmentsPayload | PostPayload;

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
 * Podpis opcjonalny (#217/#218): kolumna `text` jest NOT NULL, więc brak podpisu
 * = pusty string. Limit 200 znaków — ten sam co zwykła wiadomość.
 */
const chatCaptionSchema = z
	.string()
	.trim()
	.max(200, "Wiadomość może mieć maksymalnie 200 znaków")
	.default("");

const chatAttachmentsMessageSchema = z.object({
	kind: z.literal("attachments"),
	text: chatCaptionSchema,
	replyToId: chatReplyToIdSchema,
	payload: attachmentsPayloadSchema,
});

const chatPostMessageSchema = z.object({
	kind: z.literal("post"),
	text: chatCaptionSchema,
	replyToId: chatReplyToIdSchema,
	payload: postPayloadSchema,
});

/**
 * Wysyłka wiadomości (F1 #152 + #215/#216/#217/#218): union po `kind`. Brak
 * `kind` = zwykły tekst (wsteczna kompatybilność z klientami sprzed ankiet) —
 * dokleja preprocess. Zod v4 nie przyjmuje brakującego dyskryminatora mimo
 * `.default()`, więc domyślne `text` wstawia preprocess przed unionem.
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
		chatAttachmentsMessageSchema,
		chatPostMessageSchema,
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
