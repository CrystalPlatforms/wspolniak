// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";
import { mentionSchema } from "@/db/mentions/schema";

/** Limit długości opisu posta — jedno źródło prawdy dla serwera i formularzy. */
export const MAX_DESCRIPTION_LENGTH = 2000;

/** Maksymalna liczba wideo w jednym poście (Video v2 #194). */
export const MAX_POST_VIDEOS = 5;

/**
 * Pojedyncze wideo osadzone w poście (kolumna JSONB `posts.videos`).
 * Kolejność w tablicy = kolejność odtwarzania; tytuł to dane użytkownika
 * z kompozytora, `thumbnailUrl` pochodzi z YouTube (poster).
 */
export const postVideoSchema = z.object({
	youtubeVideoId: z.string().min(1),
	title: z.string().min(1).max(100),
	thumbnailUrl: z.string().url(),
});

/** Element kolumny `posts.videos`. */
export type PostVideoEntry = z.infer<typeof postVideoSchema>;

export const createPostSchema = z.object({
	description: z
		.string()
		.max(MAX_DESCRIPTION_LENGTH)
		.nullish()
		.transform((v) => v ?? null),
	cfImageIds: z.array(z.string().min(1)).max(10).optional(),
	videos: z.array(postVideoSchema).max(MAX_POST_VIDEOS).optional(),
	mentions: z.array(mentionSchema).max(20, "Zbyt wiele wspomnień").default([]),
});

export type CreatePostRequest = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
	description: z
		.string()
		.max(MAX_DESCRIPTION_LENGTH)
		.nullish()
		.transform((v) => v ?? null),
	cfImageIds: z.array(z.string().min(1)).max(10).optional(),
	imageOrder: z.array(z.string().min(1)).max(10).optional(),
	videos: z.array(postVideoSchema).max(MAX_POST_VIDEOS).optional(),
	mentions: z.array(mentionSchema).max(20, "Zbyt wiele wspomnień").default([]),
});

export type UpdatePostRequest = z.infer<typeof updatePostSchema>;
