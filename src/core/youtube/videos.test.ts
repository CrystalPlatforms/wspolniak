// SPDX-License-Identifier: AGPL-3.0-or-later
// deleteVideo — czysty test na granicy systemu: mockujemy tylko Google (fetchFn),
// nigdy własne moduły. Mirror wzorca z oauth.test.ts / upload.test.ts.
import { describe, expect, it, vi } from "vitest";
import type { YoutubeConfig } from "./oauth";
import { deleteVideo } from "./videos";

const config = {
	clientId: "c",
	clientSecret: "s",
	redirectUri: "u",
	stateSecret: "x",
} as YoutubeConfig;

function res(status: number): Response {
	return { ok: status >= 200 && status < 300, status } as Response;
}

describe("deleteVideo", () => {
	it("DELETEs the YouTube video by id with the Bearer token and resolves on 204", async () => {
		const fetchFn = vi.fn().mockResolvedValue(res(204));

		await deleteVideo("yt-1", "ya29", config, fetchFn);

		expect(fetchFn).toHaveBeenCalledOnce();
		const call = fetchFn.mock.calls[0];
		if (!call) throw new Error("fetchFn was not called");
		const [url, init] = call;
		expect(String(url)).toContain("https://www.googleapis.com/youtube/v3/videos");
		expect(String(url)).toContain("id=yt-1");
		expect(init?.method).toBe("DELETE");
		expect((init?.headers as Record<string, string>).authorization).toBe("Bearer ya29");
	});

	it("treats 404 (video already removed on YouTube) as success — idempotent cleanup", async () => {
		const fetchFn = vi.fn().mockResolvedValue(res(404));
		await expect(deleteVideo("yt-1", "ya29", config, fetchFn)).resolves.toBeUndefined();
	});

	it("throws a mapped AppError on a non-success status (e.g. 403)", async () => {
		const fetchFn = vi.fn().mockResolvedValue(res(403));
		await expect(deleteVideo("yt-1", "ya29", config, fetchFn)).rejects.toMatchObject({
			name: "AppError",
			status: 403,
		});
	});
});
