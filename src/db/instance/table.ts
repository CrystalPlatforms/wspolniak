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
	// Feature master switches (Wspólniak On/Off). Default to enabled so existing
	// instances keep current behaviour once the columns are added.
	videoEnabled: boolean("video_enabled").notNull().default(true),
	markdownEnabled: boolean("markdown_enabled").notNull().default(true),
	libraryEnabled: boolean("library_enabled").notNull().default(true),
	// YouTube connection (Wspólniak Wideo). refresh token is an encrypted blob;
	// decryption lives in the `youtube` module, never in this domain.
	youtubeChannelId: text("youtube_channel_id"),
	youtubeChannelTitle: text("youtube_channel_title"),
	youtubeRefreshToken: text("youtube_refresh_token"),
	youtubeConnectedAt: timestamp("youtube_connected_at"),
	youtubeConnectedBy: text("youtube_connected_by"),
});
