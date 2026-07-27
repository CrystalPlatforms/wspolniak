// SPDX-License-Identifier: AGPL-3.0-or-later
import { runVideoUpload, type Sliceable, type VideoUploadProgress } from "./use-video-upload";

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function mockFile(size: number, type = "video/mp4"): Sliceable {
	return {
		size,
		type,
		slice: (start, end) => `bytes-${start}-${end}` as unknown as Blob,
	};
}

interface CallRecord {
	url: string;
	method: string;
}

function makeFetchFn() {
	const calls: CallRecord[] = [];
	const fetchFn = vi.fn(async (url: string, init: RequestInit): Promise<Response> => {
		calls.push({ url, method: init.method ?? "GET" });
		if (url === "/api/video/upload-session") {
			return jsonResponse(201, { data: { sessionUrl: "https://session/abc" } });
		}
		if (url === "/api/video/upload-chunk") {
			const cr = (init.headers as Record<string, string>)["content-range"];
			const m = /bytes \d+-(\d+)\/(\d+)/.exec(cr ?? "");
			const end = Number(m?.[1]);
			const total = Number(m?.[2]);
			if (end === total - 1) {
				return jsonResponse(200, {
					data: { complete: true, video: { id: "yt-1", thumbnailUrl: "https://t/h.jpg" } },
				});
			}
			return jsonResponse(200, { data: { complete: false } });
		}
		if (url === "/api/video/confirm") {
			return jsonResponse(201, { data: { id: "v-1" } });
		}
		return jsonResponse(404, { error: "not found" });
	});
	return { fetchFn, calls };
}

describe("runVideoUpload", () => {
	it("runs session → chunks → confirm, reports per-chunk progress, returns the video", async () => {
		const { fetchFn, calls } = makeFetchFn();
		const progress: VideoUploadProgress[] = [];

		const result = await runVideoUpload(
			{ file: mockFile(250, "video/mp4"), title: "Wakacje", description: "Opis" },
			(p) => progress.push(p),
			{ fetchFn: fetchFn as unknown as typeof fetch, chunkSize: 100 },
		);

		expect(result).toEqual({
			id: "v-1",
			youtubeVideoId: "yt-1",
			thumbnailUrl: "https://t/h.jpg",
		});
		// 3 chunki → 3 aktualizacje postępu (kolejne bajty skumulowane)
		expect(progress).toHaveLength(3);
		expect(progress[0]).toEqual({ uploadedBytes: 100, totalBytes: 250 });
		expect(progress[2]).toEqual({ uploadedBytes: 250, totalBytes: 250 });
		expect(calls.map((c) => c.url)).toEqual([
			"/api/video/upload-session",
			"/api/video/upload-chunk",
			"/api/video/upload-chunk",
			"/api/video/upload-chunk",
			"/api/video/confirm",
		]);
		// confirm dostaje youtubeVideoId + thumbnailUrl z ostatniego chunka
		const confirmCall = fetchFn.mock.calls.find((c) => c[0] === "/api/video/confirm");
		const confirmBody = JSON.parse((confirmCall?.[1] as RequestInit).body as string);
		expect(confirmBody).toMatchObject({
			youtubeVideoId: "yt-1",
			thumbnailUrl: "https://t/h.jpg",
			title: "Wakacje",
			description: "Opis",
		});
	});

	it("sends the session URL + Content-Range per chunk", async () => {
		const { fetchFn } = makeFetchFn();
		await runVideoUpload({ file: mockFile(100), title: "T", description: null }, () => {}, {
			fetchFn: fetchFn as unknown as typeof fetch,
			chunkSize: 100,
		});
		const chunkCall = fetchFn.mock.calls.find((c) => c[0] === "/api/video/upload-chunk");
		const headers = (chunkCall?.[1] as RequestInit).headers as Record<string, string>;
		expect(headers["content-range"]).toBe("bytes 0-99/100");
		expect(headers["x-upload-session"]).toBe("https://session/abc");
	});

	it("throws when the daily limit is hit (upload-session 429)", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValue(jsonResponse(429, { error: "Osiągnięto dzienny limit wideo (3)" }));

		await expect(
			runVideoUpload({ file: mockFile(10), title: "T", description: null }, () => {}, {
				fetchFn: fetchFn as unknown as typeof fetch,
				chunkSize: 100,
			}),
		).rejects.toThrow(/limit/);
	});
});
