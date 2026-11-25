// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Jedyny template wyglądu pola tekstowego — issue #249 + iteracja usera:
 * KAŻDE pole (input, textarea, surowe pola kompozytora) wygląda identycznie.
 * Różnią się wyłącznie rozmiar/padding, typografia i placeholder.
 * Referencja: pole komentarza (MentionInput).
 *
 * Użycie: `cn(FIELD_CLASS, "px-3 py-2 text-sm")` — poza rozmiarem nic więcej.
 */
export const FIELD_CLASS = [
	"w-full rounded-md border border-input bg-background text-foreground",
	"ring-offset-background placeholder:text-muted-foreground",
	"transition-[color,box-shadow]",
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
	"disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");
