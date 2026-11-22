// SPDX-License-Identifier: AGPL-3.0-or-later
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const instanceConfig = pgTable("instance_config", {
	id: text("id").primaryKey(),
	familyName: text("family_name").notNull(),
	setupCompleted: boolean("setup_completed").notNull().default(false),
	shareCode: text("share_code"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	maintenanceMode: boolean("maintenance_mode").notNull().default(false),
	maintenanceMessage: text("maintenance_message"),
	maintenanceSubtitle: text("maintenance_subtitle"),
	maintenanceIcon: text("maintenance_icon"),
	// MARTWE (11.2026): kolumny flag instancji usunięte razem z systemem On/Off
	// (#245 reviza) — wszystkie funkcje są zawsze włączone. ai_enabled to
	// kolejna martwa kolumna po AL (PRD #178).
	// YouTube connection (Wspólniak Wideo). refresh token is an encrypted blob;
	// decryption lives in the `youtube` module, never in this domain.
	youtubeChannelId: text("youtube_channel_id"),
	youtubeChannelTitle: text("youtube_channel_title"),
	youtubeRefreshToken: text("youtube_refresh_token"),
	youtubeConnectedAt: timestamp("youtube_connected_at"),
	youtubeConnectedBy: text("youtube_connected_by"),
});
