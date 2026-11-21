// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";
import { mentionSchema } from "@/db/mentions/schema";
import { MAX_POST_FILES, postFileMetaSchema } from "@/db/post-files/schema";

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

/**
 * Ankieta w poście (#241): pytanie + 2–6 niepustych opcji po maks. 100 znaków.
 * Limity odziedziczone z ankiet czatowych (PRD #240). Max 1 ankieta na post —
 * to cała kolumna JSONB, nie osobna tabela.
 */
export const postPollSchema = z.object({
	question: z
		.string()
		.trim()
		.min(1, "Pytanie nie może być puste")
		.max(200, "Pytanie może mieć maksymalnie 200 znaków"),
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

/** Payload kolumny `posts.poll` — samo pytanie i opcje (wyniki liczy serwer). */
export type PostPollPayload = z.infer<typeof postPollSchema>;

/**
 * Ankieta w odpowiedziach API (#241): payload + zagregowane wyniki. `counts`
 * i `myVoteIndex` dokleja serwer (enrichPosts / voteOnPostPoll); tożsamości
 * innych głosujących nigdy tu nie trafiają (głosowanie tajne).
 */
export interface PostPollData {
	question: string;
	options: string[];
	counts: number[];
	/** Głos oglądającego (null = nie głosował) — potrzebny UX „zmień głos". */
	myVoteIndex: number | null;
}

/**
 * Lokalizacja w poście (#242): współrzędne w zakresach geograficznych +
 * opcjonalna ręczna etykieta (bez geokodowania — decyzja PRD #240). Max 1 na post.
 */
export const postLocationSchema = z.object({
	lat: z.number().min(-90, "Szerokość poza zakresem").max(90, "Szerokość poza zakresem"),
	lng: z.number().min(-180, "Długość poza zakresem").max(180, "Długość poza zakresem"),
	label: z.string().trim().min(1).max(200, "Etykieta może mieć maksymalnie 200 znaków").optional(),
});

/** Payload kolumny `posts.location`. */
export type PostLocationPayload = z.infer<typeof postLocationSchema>;

/** Głos w ankiecie posta (#241) — indeks opcji; zakres wobec liczby opcji pilnuje domena. */
export const votePostPollSchema = z.object({
	optionIndex: z
		.number()
		.int("Głos musi być indeksem opcji")
		.min(0, "Nieprawidłowa opcja")
		.max(5, "Nieprawidłowa opcja"),
});

export type VotePostPollRequest = z.infer<typeof votePostPollSchema>;

export const createPostSchema = z.object({
	description: z
		.string()
		.max(MAX_DESCRIPTION_LENGTH)
		.nullish()
		.transform((v) => v ?? null),
	cfImageIds: z.array(z.string().min(1)).max(10).optional(),
	videos: z.array(postVideoSchema).max(MAX_POST_VIDEOS).optional(),
	poll: postPollSchema.nullish(),
	location: postLocationSchema.nullish(),
	/** Pliki z uploadu (#243) — attach po kluczu; max 5, bez dubli. */
	files: z
		.array(postFileMetaSchema)
		.max(MAX_POST_FILES, "Możesz załączyć maksymalnie 5 plików")
		.optional(),
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
	/**
	 * Lokalizacja (#242): obiekt = ustaw/zmień, null = usuń, brak pola = bez zmian.
	 * (Ankiety to dotyczy nie — poll jest celowo poza tym schematem i update go
	 * całkowicie ignoruje.)
	 */
	location: postLocationSchema.nullish(),
	/**
	 * Pliki (#243): PEŁNA docelowa lista (zostawione + nowe). Brak pola = bez
	 * zmian; pliki poza listą znikają z bazy i z R2.
	 */
	files: z
		.array(postFileMetaSchema)
		.max(MAX_POST_FILES, "Możesz załączyć maksymalnie 5 plików")
		.optional(),
	mentions: z.array(mentionSchema).max(20, "Zbyt wiele wspomnień").default([]),
});

export type UpdatePostRequest = z.infer<typeof updatePostSchema>;
