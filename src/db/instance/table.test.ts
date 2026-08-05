// SPDX-License-Identifier: AGPL-3.0-or-later
import { getTableColumns, getTableName } from "drizzle-orm";
import { instanceConfig } from "./table";

describe("instance_config table", () => {
	const columns = getTableColumns(instanceConfig);

	it("is named 'instance_config'", () => {
		expect(getTableName(instanceConfig)).toBe("instance_config");
	});

	it("has all expected columns", () => {
		expect(Object.keys(columns).sort()).toEqual(
			[
				"id",
				"familyName",
				"setupCompleted",
				"shareCode",
				"createdAt",
				"maintenanceMode",
				"maintenanceMessage",
				"maintenanceSubtitle",
				"maintenanceIcon",
				"videoEnabled",
				"markdownEnabled",
				"youtubeChannelId",
				"youtubeChannelTitle",
				"youtubeRefreshToken",
				"youtubeConnectedAt",
				"youtubeConnectedBy",
			].sort(),
		);
	});

	it("id is text primary key", () => {
		expect(columns.id.dataType).toBe("string");
		expect(columns.id.primary).toBe(true);
	});

	it("family_name is text not null", () => {
		expect(columns.familyName.dataType).toBe("string");
		expect(columns.familyName.notNull).toBe(true);
	});

	it("setup_completed is boolean not null with default false", () => {
		expect(columns.setupCompleted.dataType).toBe("boolean");
		expect(columns.setupCompleted.notNull).toBe(true);
		expect(columns.setupCompleted.hasDefault).toBe(true);
	});

	it("share_code is nullable text", () => {
		expect(columns.shareCode.dataType).toBe("string");
		expect(columns.shareCode.notNull).toBe(false);
	});

	it("maintenance_mode is boolean not null with default false", () => {
		expect(columns.maintenanceMode.dataType).toBe("boolean");
		expect(columns.maintenanceMode.notNull).toBe(true);
		expect(columns.maintenanceMode.hasDefault).toBe(true);
	});

	it("maintenance_message is nullable text", () => {
		expect(columns.maintenanceMessage.dataType).toBe("string");
		expect(columns.maintenanceMessage.notNull).toBe(false);
	});

	it("maintenance_subtitle is nullable text", () => {
		expect(columns.maintenanceSubtitle.dataType).toBe("string");
		expect(columns.maintenanceSubtitle.notNull).toBe(false);
	});

	it("maintenance_icon is nullable text", () => {
		expect(columns.maintenanceIcon.dataType).toBe("string");
		expect(columns.maintenanceIcon.notNull).toBe(false);
	});

	it("video_enabled is boolean not null with default true", () => {
		expect(columns.videoEnabled.dataType).toBe("boolean");
		expect(columns.videoEnabled.notNull).toBe(true);
		expect(columns.videoEnabled.hasDefault).toBe(true);
	});

	it("markdown_enabled is boolean not null with default true", () => {
		expect(columns.markdownEnabled.dataType).toBe("boolean");
		expect(columns.markdownEnabled.notNull).toBe(true);
		expect(columns.markdownEnabled.hasDefault).toBe(true);
	});

	it("created_at is timestamp not null with default", () => {
		expect(columns.createdAt.dataType).toBe("date");
		expect(columns.createdAt.notNull).toBe(true);
		expect(columns.createdAt.hasDefault).toBe(true);
	});

	it("youtube_channel_id is nullable text", () => {
		expect(columns.youtubeChannelId.dataType).toBe("string");
		expect(columns.youtubeChannelId.notNull).toBe(false);
	});

	it("youtube_channel_title is nullable text", () => {
		expect(columns.youtubeChannelTitle.dataType).toBe("string");
		expect(columns.youtubeChannelTitle.notNull).toBe(false);
	});

	it("youtube_refresh_token is nullable text (encrypted blob)", () => {
		expect(columns.youtubeRefreshToken.dataType).toBe("string");
		expect(columns.youtubeRefreshToken.notNull).toBe(false);
	});

	it("youtube_connected_at is nullable timestamp", () => {
		expect(columns.youtubeConnectedAt.dataType).toBe("date");
		expect(columns.youtubeConnectedAt.notNull).toBe(false);
	});

	it("youtube_connected_by is nullable text", () => {
		expect(columns.youtubeConnectedBy.dataType).toBe("string");
		expect(columns.youtubeConnectedBy.notNull).toBe(false);
	});
});
