// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";
import { reactionTypes } from "@/db/post-reactions/table";

export const createChatMessageSchema = z.object({
	text: z
		.string()
		.trim()
		.min(1, "Wiadomość nie może być pusta")
		.max(200, "Wiadomość może mieć maksymalnie 200 znaków"),
	/** Reply (F5 #156) — id oryginału; snapshot tekstu robi serwer przy wysyłce. */
	replyToId: z.string().min(1).optional(),
});

export type CreateChatMessageRequest = z.infer<typeof createChatMessageSchema>;

/** Toggle reakcji (F4 #155) — te same 3 typy co feed; nieznany typ → 400 w API. */
export const toggleChatReactionSchema = z.object({
	reaction: z.enum(reactionTypes),
});

export type ToggleChatReactionRequest = z.infer<typeof toggleChatReactionSchema>;
