// SPDX-License-Identifier: AGPL-3.0-or-later
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { ChatMessageKind, ChatMessagePayload } from "./schema";

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
		// Rodzaj wiadomości (F2 #215): 'text' | 'poll' | … — default 'text'
		// backfilluje istniejące wiersze po migracji; ważność pary kind/payload
		// waliduje Zod na wejściu (baza trzyma JSONB bezschemaowo).
		kind: text("kind").$type<ChatMessageKind>().default("text").notNull(),
		// Payload typów bogatych (F2 #215) — null dla zwykłego tekstu.
		payload: jsonb("payload").$type<ChatMessagePayload>(),
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
// UNIQUE(message_id, user_id) = JEDNA reakcja na usera na wiadomość (jak w
// feedzie; decyzja usera po HITL — klik innego typu zastępuje, nie dokłada).
export const chatReactions = pgTable(
	"chat_reactions",
	{
		id: text("id").primaryKey(),
		messageId: text("message_id").notNull(),
		userId: text("user_id").notNull(),
		reaction: text("reaction").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [uniqueIndex("chat_reactions_message_user_idx").on(t.messageId, t.userId)],
);

// Głosy w ankietach (F2 #215) — JEDEN wiersz na (message_id, user_id): zmiana
// głosu to atomowy upsert (ON CONFLICT DO UPDATE po tym indeksie), więc
// unikalność nigdy nie wycieka błędem. Głosowanie tajne — tożsamość głosującego
// nigdy nie wychodzi do klientów (serwer agreguje do liczników).
export const chatPollVotes = pgTable(
	"chat_poll_votes",
	{
		id: text("id").primaryKey(),
		messageId: text("message_id").notNull(),
		userId: text("user_id").notNull(),
		optionIndex: integer("option_index").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [uniqueIndex("chat_poll_votes_message_user_idx").on(t.messageId, t.userId)],
);
