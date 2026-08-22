// SPDX-License-Identifier: AGPL-3.0-or-later
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Czat rodzinny — wiadomości znikają po 24h (expires_at ustawia baza).
// author_id to zwykła kolumna tekstowa (bez DB FK) — konwencja projektu
// (jak bookmarks, post_reactions, calendar). Wygasłe wiadomości odfiltrowuje
// zawsze zapytanie (expires_at > now()); cron z F7 czyści dodatkowo.
export const chatMessages = pgTable(
	"chat_messages",
	{
		id: text("id").primaryKey(),
		authorId: text("author_id").notNull(),
		text: text("text").notNull(),
		// Reply (F5): referencja + snapshot tekstu oryginału w momencie wysłania.
		replyToId: text("reply_to_id"),
		replyText: text("reply_text"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		expiresAt: timestamp("expires_at").default(sql`now() + interval '24 hours'`).notNull(),
	},
	(t) => [
		// Cron czyszczenia (F7) skanuje po expires_at; okno 24h czyta po created_at.
		index("chat_messages_expires_at_idx").on(t.expiresAt),
		index("chat_messages_created_at_idx").on(t.createdAt),
	],
);

// Reakcje na wiadomości czatu (F4) — te same 3 typy co w feedzie.
// UNIQUE(message_id, user_id, reaction) = jedna reakcja danego typu na wiadomość.
export const chatReactions = pgTable(
	"chat_reactions",
	{
		id: text("id").primaryKey(),
		messageId: text("message_id").notNull(),
		userId: text("user_id").notNull(),
		reaction: text("reaction").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("chat_reactions_message_user_reaction_idx").on(t.messageId, t.userId, t.reaction),
	],
);
