// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";

export const createChatMessageSchema = z.object({
	text: z
		.string()
		.trim()
		.min(1, "Wiadomość nie może być pusta")
		.max(200, "Wiadomość może mieć maksymalnie 200 znaków"),
});

export type CreateChatMessageRequest = z.infer<typeof createChatMessageSchema>;
