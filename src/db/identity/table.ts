// SPDX-License-Identifier: AGPL-3.0-or-later
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	role: text("role").notNull(),
	tokenHash: text("token_hash").notNull().unique(),
	deletedAt: timestamp("deleted_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	// AL (Wspólniak AI) — dostęp per user (PRD #178). Opt-in ustawia user
	// w Ustawieniach; blokady dokonuje admin na liście członków.
	aiOptIn: boolean("ai_opt_in").notNull().default(false),
	aiBlocked: boolean("ai_blocked").notNull().default(false),
});
