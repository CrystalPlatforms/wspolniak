// SPDX-License-Identifier: AGPL-3.0-or-later
import { AppError } from "@/core/errors";
import type { YoutubeConfig } from "./oauth";
import { type ChunkRange, forwardChunk, pickThumbnail, startResumableUpload } from "./upload";

const config: YoutubeConfig = {
	clientId: "client-123",
	clientSecret: "secret-456",
	redirectUri: "https://wspolniak.test/api/video/oauth/callback",
	stateSecret: "state-signing-key",
};

describe("startResumableUpload", () => {
	it("starts a resumable session and returns the Location URL", async () => {
		const sessionUrl = "https://upload.googleapis.com/upload/youtube/v3/.../session-abc";
		const fetchFn = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 201, headers: { location: sessionUrl } }));

		const result = await startResumableUpload(
			"ya29.access",
			{ title: "Wakacje", description: "Opis", size: 1000, mime: "video/mp4" },
			config,
			fetchFn,
		);

		expect(result.sessionUrl).toBe(sessionUrl);
		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toContain("uploadType=resumable");
		expect(url).toContain("part=snippet,status");
		const headers = (init as RequestInit).headers as Record<string, string>;
		expect(headers.authorization).toBe("Bearer ya29.access");
		expect(headers["x-upload-content-length"]).toBe("1000");
		expect(headers["x-upload-content-type"]).toBe("video/mp4");
		const body = JSON.parse((init as RequestInit).body as string);
		// kluczowe dla AC: wideo musi być unlisted
		expect(body.status.privacyStatus).toBe("unlisted");
		expect(body.snippet.title).toBe("Wakacje");
		expect(body.snippet.description).toBe("Opis");
	});

	it("throws AppError when the Location header is missing", async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));

		await expect(
			startResumableUpload(
				"ya29.access",
				{ title: "T", description: null, size: 10, mime: "video/mp4" },
				config,
				fetchFn,
			),
		).rejects.toThrow(AppError);
	});

	it("maps a 401 to a typed AppError without leaking the raw response body", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ hint: "SECRET-LEAK" }), { status: 401 }));

		let thrown: unknown;
		try {
			await startResumableUpload(
				"ya29.access",
				{ title: "T", description: null, size: 10, mime: "video/mp4" },
				config,
				fetchFn,
			);
		} catch (e) {
			thrown = e;
		}

		expect(thrown).toBeInstanceOf(AppError);
		expect((thrown as AppError).code).toBe("UNAUTHORIZED");
		// AC: błędy YouTube nigdy nie mogą wyciec jako surowe
		expect((thrown as AppError).message).not.toContain("SECRET-LEAK");
	});
});

describe("pickThumbnail", () => {
	it("prefers higher-resolution thumbnails when available", () => {
		expect(
			pickThumbnail({
				thumbnails: { default: { url: "d" }, medium: { url: "m" }, high: { url: "h" } },
			}),
		).toBe("h");
		expect(
			pickThumbnail({
				thumbnails: { default: { url: "d" }, high: { url: "h" }, maxres: { url: "x" } },
			}),
		).toBe("x");
		expect(
			pickThumbnail({
				thumbnails: { default: { url: "d" }, standard: { url: "s" }, high: { url: "h" } },
			}),
		).toBe("s");
	});

	it("falls back to default when nothing bigger is present", () => {
		expect(pickThumbnail({ thumbnails: { default: { url: "d" } } })).toBe("d");
	});

	it("returns empty string when no thumbnails are present", () => {
		expect(pickThumbnail({})).toBe("");
		expect(pickThumbnail({ thumbnails: {} })).toBe("");
	});
});

const RANGE: ChunkRange = { start: 0, end: 99, total: 100 };
const CHUNK = new Uint8Array(100);

describe("forwardChunk", () => {
	it("returns {complete:false} on a 308 Resume Incomplete", async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 308 }));

		const result = await forwardChunk("ya29", "https://session", RANGE, CHUNK, config, fetchFn);

		expect(result).toEqual({ complete: false });
	});

	it("returns the video id + thumbnail on a 201 completion", async () => {
		const fetchFn = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					id: "yt-vid-1",
					snippet: { thumbnails: { high: { url: "https://thumb/h.jpg" } } },
				}),
				{ status: 201 },
			),
		);

		const result = await forwardChunk("ya29", "https://session", RANGE, CHUNK, config, fetchFn);

		expect(result).toEqual({
			complete: true,
			video: { id: "yt-vid-1", thumbnailUrl: "https://thumb/h.jpg" },
		});
		const init = fetchFn.mock.calls[0][1] as RequestInit;
		expect(init.method).toBe("PUT");
		expect((init.headers as Record<string, string>)["content-range"]).toBe("bytes 0-99/100");
		expect((init.headers as Record<string, string>).authorization).toBe("Bearer ya29");
	});

	it("maps a 403 to a typed AppError without leaking the raw body", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ hint: "SECRET-LEAK" }), { status: 403 }));

		let thrown: unknown;
		try {
			await forwardChunk("ya29", "https://session", RANGE, CHUNK, config, fetchFn);
		} catch (e) {
			thrown = e;
		}

		expect(thrown).toBeInstanceOf(AppError);
		expect((thrown as AppError).code).toBe("UNAUTHORIZED");
		expect((thrown as AppError).message).not.toContain("SECRET-LEAK");
	});
});
