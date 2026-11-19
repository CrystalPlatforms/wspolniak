// SPDX-License-Identifier: AGPL-3.0-or-later
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	role: text("role").notNull(),
	tokenHash: text("token_hash").notNull().unique(),
	deletedAt: timestamp("deleted_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	// MARTWE (11.2026): po usunięciu asystenta AL zostały w bazie bez migracji —
	// nie używać w kodzie (historia: PRD #178, dostęp per user).
	aiOptIn: boolean("ai_opt_in").notNull().default(false),
	aiBlocked: boolean("ai_blocked").notNull().default(false),
});
