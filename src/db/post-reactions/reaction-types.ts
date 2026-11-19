// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Typy reakcji — plik lekki, bez drizzle (issue #239). Źródło prawdy dla tabeli
 * (post-reactions/table), payloadów chatu (db/chat/schema) i UI reakcji
 * (reaction-config). Klient importuje głęboką ścieżką @/db/post-reactions/reaction-types.
 */
export const reactionTypes = ["heart", "laugh", "flame", "wow", "sad"] as const;

export type ReactionType = (typeof reactionTypes)[number];
