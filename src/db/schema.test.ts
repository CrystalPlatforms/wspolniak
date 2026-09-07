// SPDX-License-Identifier: AGPL-3.0-or-later
import { getTableName } from "drizzle-orm";
import * as schema from "./schema";

describe("db/schema barrel export", () => {
	it("exports users table", () => {
		expect(schema.users).toBeDefined();
		expect(getTableName(schema.users)).toBe("users");
	});

	it("exports instanceConfig table", () => {
		expect(schema.instanceConfig).toBeDefined();
		expect(getTableName(schema.instanceConfig)).toBe("instance_config");
	});

	it("does not export removed clients table", () => {
		expect("clients" in schema).toBe(false);
	});

	it("does not export removed videos/postVideos tables (Video v2 #194)", () => {
		expect("videos" in schema).toBe(false);
		expect("postVideos" in schema).toBe(false);
	});

	it("exports videoUploadEvents table (#194 — dzienny limit uploadów)", () => {
		expect(schema.videoUploadEvents).toBeDefined();
		expect(getTableName(schema.videoUploadEvents)).toBe("video_upload_events");
	});
});
