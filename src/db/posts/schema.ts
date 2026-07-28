// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";
import { mentionSchema } from "@/db/mentions/schema";

export const createPostSchema = z.object({
	description: z
		.string()
		.max(2000)
		.nullish()
		.transform((v) => v ?? null),
	cfImageIds: z.array(z.string().min(1)).max(10).optional(),
	videoIds: z.array(z.string().min(1)).max(10).optional(),
	mentions: z.array(mentionSchema).max(20, "Zbyt wiele wspomnień").default([]),
});

export type CreatePostRequest = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
	description: z
		.string()
		.max(2000)
		.nullish()
		.transform((v) => v ?? null),
	cfImageIds: z.array(z.string().min(1)).max(10).optional(),
	imageOrder: z.array(z.string().min(1)).max(10).optional(),
	videoIds: z.array(z.string().min(1)).max(10).optional(),
	mentions: z.array(mentionSchema).max(20, "Zbyt wiele wspomnień").default([]),
});

export type UpdatePostRequest = z.infer<typeof updatePostSchema>;
