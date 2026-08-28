// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { AppError } from "@/core/errors";
import type { SessionPayload } from "@/db/identity/session";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
}));

vi.mock("@/core/youtube", () => ({
	buildAuthorizationUrl: vi.fn(),
	createState: vi.fn(),
	verifyState: vi.fn(),
	exchangeCodeForTokens: vi.fn(),
	fetchOwnChannel: vi.fn(),
	importEncryptionKey: vi.fn(),
	encryptRefreshToken: vi.fn(),
	decryptRefreshToken: vi.fn(),
	refreshAccessToken: vi.fn(),
	startResumableUpload: vi.fn(),
	forwardChunk: vi.fn(),
	deleteVideo: vi.fn(),
}));

vi.mock("@/db/instance", () => ({
	getYoutubeConnection: vi.fn(),
	setYoutubeConnection: vi.fn(),
	clearYoutubeConnection: vi.fn(),
	getYoutubeRefreshToken: vi.fn(),
}));

vi.mock("@/db/albums", () => ({
	deleteAlbumItemsByRefs: vi.fn(),
}));

vi.mock("@/db/videos", () => ({
	countTodayUTC: vi.fn(),
	createVideo: vi.fn(),
	deleteVideo: vi.fn(),
	getVideoById: vi.fn(),
	DAILY_VIDEO_LIMIT: 3,
	MAX_VIDEO_BYTES: 2 * 1024 * 1024 * 1024,
	startUploadSchema: {
		safeParse: (b: unknown) => {
			const obj = b as Record<string, unknown>;
			if (typeof obj?.title !== "string" || obj.title.length === 0) {
				return { success: false, error: { flatten: () => ({ formErrors: ["title"] }) } };
			}
			return { success: true, data: obj };
		},
	},
	confirmVideoSchema: {
		safeParse: (b: unknown) => {
			const obj = b as Record<string, unknown>;
			if (typeof obj?.title !== "string" || obj.title.length === 0) {
				return { success: false, error: { flatten: () => ({ formErrors: ["title"] }) } };
			}
			if (typeof obj?.thumbnailUrl !== "string" || !obj.thumbnailUrl.startsWith("http")) {
				return { success: false, error: { flatten: () => ({ formErrors: ["thumbnailUrl"] }) } };
			}
			return { success: true, data: obj };
		},
	},
}));

import {
	buildAuthorizationUrl,
	createState,
	decryptRefreshToken,
	deleteVideo as deleteYoutubeVideo,
	encryptRefreshToken,
	exchangeCodeForTokens,
	fetchOwnChannel,
	forwardChunk,
	importEncryptionKey,
	refreshAccessToken,
	startResumableUpload,
	verifyState,
} from "@/core/youtube";
import { deleteAlbumItemsByRefs } from "@/db/albums";
import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import {
	clearYoutubeConnection,
	getYoutubeConnection,
	getYoutubeRefreshToken,
	setYoutubeConnection,
} from "@/db/instance";
import { countTodayUTC, createVideo, deleteVideo, getVideoById } from "@/db/videos";
import videoEndpoint from "./video";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockCreateState = vi.mocked(createState);
const mockBuildAuthUrl = vi.mocked(buildAuthorizationUrl);
const mockVerifyState = vi.mocked(verifyState);
const mockExchange = vi.mocked(exchangeCodeForTokens);
const mockFetchChannel = vi.mocked(fetchOwnChannel);
const mockImportKey = vi.mocked(importEncryptionKey);
const mockEncrypt = vi.mocked(encryptRefreshToken);
const mockGetConnection = vi.mocked(getYoutubeConnection);
const mockSet = vi.mocked(setYoutubeConnection);
const mockClear = vi.mocked(clearYoutubeConnection);

const ENV = {
	SESSION_SECRET: "secret",
	APP_URL: "https://wspolniak.test",
	YOUTUBE_CLIENT_ID: "client-123",
	YOUTUBE_CLIENT_SECRET: "secret-456",
	YOUTUBE_TOKEN_ENCRYPTION_KEY: "enc-key",
} as unknown as Env;

function createApi() {
	return new Hono<{ Bindings: Env }>().basePath("/api").route("/video", videoEndpoint);
}

function adminHeaders() {
	return { Cookie: "session=valid-jwt" };
}

function adminSession() {
	mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "admin" });
	mockFindUser.mockResolvedValue({
		id: "u1",
		name: "Tomek",
		role: "admin",
		tokenHash: "hash",
		deletedAt: null,
		createdAt: new Date(),
	});
}

function memberSession() {
	const member: SessionPayload = { userId: "u2", name: "Kasia", role: "member" };
	mockVerify.mockResolvedValue(member);
	mockFindUser.mockResolvedValue({
		id: "u2",
		name: "Kasia",
		role: "member",
		tokenHash: "hash",
		deletedAt: null,
		createdAt: new Date(),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	adminSession();
});

describe("GET /api/video/connection", () => {
	it("returns the connection status", async () => {
		mockGetConnection.mockResolvedValue({
			connected: true,
			channelId: "UC1",
			channelTitle: "Wspólniak Wideo",
			connectedAt: new Date(),
			connectedBy: "u1",
		});

		const api = createApi();
		const res = await api.request("/api/video/connection", { headers: adminHeaders() }, ENV);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { connected: boolean; channelTitle: string } };
		expect(body.data.connected).toBe(true);
		expect(body.data.channelTitle).toBe("Wspólniak Wideo");
	});

	it("returns 403 for a non-admin member", async () => {
		memberSession();
		const api = createApi();
		const res = await api.request("/api/video/connection", { headers: adminHeaders() }, ENV);

		expect(res.status).toBe(403);
		expect(mockGetConnection).not.toHaveBeenCalled();
	});
});

describe("DELETE /api/video/connection", () => {
	it("clears the connection and returns ok", async () => {
		mockClear.mockResolvedValue(undefined);

		const api = createApi();
		const res = await api.request(
			"/api/video/connection",
			{
				method: "DELETE",
				headers: adminHeaders(),
			},
			ENV,
		);

		expect(res.status).toBe(200);
		expect(mockClear).toHaveBeenCalledOnce();
		const body = (await res.json()) as { data: { ok: boolean } };
		expect(body.data.ok).toBe(true);
	});

	it("returns 403 for a non-admin member", async () => {
		memberSession();
		const api = createApi();
		const res = await api.request(
			"/api/video/connection",
			{
				method: "DELETE",
				headers: adminHeaders(),
			},
			ENV,
		);

		expect(res.status).toBe(403);
		expect(mockClear).not.toHaveBeenCalled();
	});
});

describe("GET /api/video/oauth/start", () => {
	it("redirects to the Google consent URL with a signed state", async () => {
		mockCreateState.mockResolvedValue("signed-state");
		mockBuildAuthUrl.mockReturnValue(
			"https://accounts.google.com/o/oauth2/v2/auth?state=signed-state",
		);

		const api = createApi();
		const res = await api.request("/api/video/oauth/start", { headers: adminHeaders() }, ENV);

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toContain("https://accounts.google.com");
		// state is bound to the admin who started the flow
		expect(mockCreateState).toHaveBeenCalledWith(
			"u1",
			expect.objectContaining({ clientId: "client-123" }),
		);
		expect(mockBuildAuthUrl).toHaveBeenCalledWith(
			"signed-state",
			expect.objectContaining({ clientId: "client-123" }),
		);
	});

	it("returns 503 when YouTube env is not configured", async () => {
		const noYoutube = {
			SESSION_SECRET: "secret",
			APP_URL: "https://wspolniak.test",
		} as unknown as Env;

		const api = createApi();
		const res = await api.request("/api/video/oauth/start", { headers: adminHeaders() }, noYoutube);

		expect(res.status).toBe(503);
		expect(mockCreateState).not.toHaveBeenCalled();
	});

	it("uses the YOUTUBE_REDIRECT_URI override when set", async () => {
		mockCreateState.mockResolvedValue("s");
		mockBuildAuthUrl.mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth");
		const envWithRedirect = {
			...ENV,
			YOUTUBE_REDIRECT_URI: "http://localhost:3000/api/video/oauth/callback",
		} as unknown as Env;

		const api = createApi();
		await api.request("/api/video/oauth/start", { headers: adminHeaders() }, envWithRedirect);

		expect(mockBuildAuthUrl).toHaveBeenCalledWith(
			"s",
			expect.objectContaining({
				redirectUri: "http://localhost:3000/api/video/oauth/callback",
			}),
		);
	});

	it("returns 403 for a non-admin member", async () => {
		memberSession();
		const api = createApi();
		const res = await api.request("/api/video/oauth/start", { headers: adminHeaders() }, ENV);

		expect(res.status).toBe(403);
	});
});

describe("GET /api/video/oauth/callback", () => {
	it("exchanges, encrypts, stores the connection and redirects to the admin panel", async () => {
		mockVerifyState.mockResolvedValue({ adminUserId: "u1" });
		mockExchange.mockResolvedValue({
			accessToken: "ya29.access",
			refreshToken: "1//refresh",
			expiresIn: 3600,
		});
		mockFetchChannel.mockResolvedValue({ id: "UC1", title: "Wspólniak Wideo" });
		mockImportKey.mockResolvedValue("crypto-key" as unknown as CryptoKey);
		mockEncrypt.mockResolvedValue("enc-blob");
		mockSet.mockResolvedValue(undefined);

		const api = createApi();
		const res = await api.request(
			"/api/video/oauth/callback?code=the-code&state=the-state",
			{ headers: adminHeaders() },
			ENV,
		);

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toContain("/app/admin");
		expect(res.headers.get("location")).toContain("youtube=connected");

		expect(mockExchange).toHaveBeenCalledWith("the-code", expect.any(Object));
		expect(mockFetchChannel).toHaveBeenCalledWith("ya29.access", expect.any(Object));
		expect(mockEncrypt).toHaveBeenCalledWith("1//refresh", "crypto-key");
		expect(mockSet).toHaveBeenCalledWith({
			channelId: "UC1",
			channelTitle: "Wspólniak Wideo",
			encryptedRefreshToken: "enc-blob",
			connectedBy: "u1",
		});
	});

	it("returns 400 when the state is invalid (CSRF)", async () => {
		mockVerifyState.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/video/oauth/callback?code=c&state=bad",
			{ headers: adminHeaders() },
			ENV,
		);

		expect(res.status).toBe(400);
		expect(mockExchange).not.toHaveBeenCalled();
		expect(mockSet).not.toHaveBeenCalled();
	});

	it("returns 400 when the code is missing", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/video/oauth/callback?state=s",
			{ headers: adminHeaders() },
			ENV,
		);

		expect(res.status).toBe(400);
		expect(mockExchange).not.toHaveBeenCalled();
	});

	it("returns 403 for a non-admin member", async () => {
		memberSession();
		const api = createApi();
		const res = await api.request(
			"/api/video/oauth/callback?code=c&state=s",
			{ headers: adminHeaders() },
			ENV,
		);

		expect(res.status).toBe(403);
		expect(mockExchange).not.toHaveBeenCalled();
	});
});

const mockDecrypt = vi.mocked(decryptRefreshToken);
const mockRefresh = vi.mocked(refreshAccessToken);
const mockStartUpload = vi.mocked(startResumableUpload);
const mockForwardChunk = vi.mocked(forwardChunk);
const mockGetToken = vi.mocked(getYoutubeRefreshToken);
const mockCountToday = vi.mocked(countTodayUTC);

function jsonHeaders() {
	return { ...adminHeaders(), "Content-Type": "application/json" };
}

function uploadSessionBody(overrides: Record<string, unknown> = {}) {
	return JSON.stringify({
		title: "Wakacje",
		description: "Opis",
		size: 1000,
		mime: "video/mp4",
		...overrides,
	});
}

function connectedYoutube() {
	mockGetToken.mockResolvedValue({ encryptedRefreshToken: "enc", channelId: "UC1" });
	mockImportKey.mockResolvedValue("key" as unknown as CryptoKey);
	mockDecrypt.mockResolvedValue("refresh-token");
	mockRefresh.mockResolvedValue({ accessToken: "ya29", expiresIn: 3600 });
}

describe("POST /api/video/upload-session", () => {
	beforeEach(() => {
		memberSession();
		mockCountToday.mockResolvedValue(0);
		connectedYoutube();
		mockStartUpload.mockResolvedValue({ sessionUrl: "https://session.url/abc" });
	});

	it("starts a resumable session for an authenticated member", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/video/upload-session",
			{ method: "POST", headers: jsonHeaders(), body: uploadSessionBody() },
			ENV,
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as { data: { sessionUrl: string } };
		expect(body.data.sessionUrl).toBe("https://session.url/abc");
		expect(mockStartUpload).toHaveBeenCalledWith(
			"ya29",
			expect.objectContaining({ title: "Wakacje", size: 1000 }),
			expect.any(Object),
		);
	});

	it("rejects at the daily limit BEFORE any YouTube call", async () => {
		mockCountToday.mockResolvedValue(3);
		const api = createApi();
		const res = await api.request(
			"/api/video/upload-session",
			{ method: "POST", headers: jsonHeaders(), body: uploadSessionBody() },
			ENV,
		);

		expect(res.status).toBe(429);
		// żadnego calla do YouTube (limit sprawdzany wcześniej)
		expect(mockStartUpload).not.toHaveBeenCalled();
		expect(mockRefresh).not.toHaveBeenCalled();
		expect(mockGetToken).not.toHaveBeenCalled();
	});

	it("returns 503 when YouTube is not connected (no refresh token)", async () => {
		mockGetToken.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/video/upload-session",
			{ method: "POST", headers: jsonHeaders(), body: uploadSessionBody() },
			ENV,
		);

		expect(res.status).toBe(503);
		expect(mockStartUpload).not.toHaveBeenCalled();
	});

	it("returns 400 when the body is missing the title", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/video/upload-session",
			{ method: "POST", headers: jsonHeaders(), body: uploadSessionBody({ title: undefined }) },
			ENV,
		);

		expect(res.status).toBe(400);
		expect(mockCountToday).not.toHaveBeenCalled();
	});

	it("returns 413 when the file exceeds the max size", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/video/upload-session",
			{
				method: "POST",
				headers: jsonHeaders(),
				body: uploadSessionBody({ size: 3 * 1024 * 1024 * 1024 }),
			},
			ENV,
		);

		expect(res.status).toBe(413);
		expect(mockStartUpload).not.toHaveBeenCalled();
	});

	it("returns 401 without a session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/video/upload-session",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: uploadSessionBody(),
			},
			ENV,
		);

		expect(res.status).toBe(401);
	});
});

function chunkHeaders(range: string, session = "https://session.url/abc") {
	return { ...adminHeaders(), "content-range": range, "x-upload-session": session };
}

describe("PUT /api/video/upload-chunk", () => {
	beforeEach(() => {
		memberSession();
		connectedYoutube();
	});

	it("forwards a chunk and returns {complete:false} on 308", async () => {
		mockForwardChunk.mockResolvedValue({ complete: false });
		const api = createApi();
		const res = await api.request(
			"/api/video/upload-chunk",
			{ method: "PUT", headers: chunkHeaders("bytes 0-99/100"), body: new Uint8Array(100) },
			ENV,
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { complete: boolean } };
		expect(body.data.complete).toBe(false);
		expect(mockForwardChunk).toHaveBeenCalledWith(
			"ya29",
			"https://session.url/abc",
			{ start: 0, end: 99, total: 100 },
			expect.anything(),
			expect.any(Object),
		);
	});

	it("returns the video when the final chunk completes the upload", async () => {
		mockForwardChunk.mockResolvedValue({
			complete: true,
			video: { id: "yt-1", thumbnailUrl: "https://t/h.jpg" },
		});
		const api = createApi();
		const res = await api.request(
			"/api/video/upload-chunk",
			{ method: "PUT", headers: chunkHeaders("bytes 0-99/100"), body: new Uint8Array(100) },
			ENV,
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			data: { complete: boolean; video: { id: string; thumbnailUrl: string } };
		};
		expect(body.data).toEqual({
			complete: true,
			video: { id: "yt-1", thumbnailUrl: "https://t/h.jpg" },
		});
	});

	it("returns 400 when Content-Range is missing", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/video/upload-chunk",
			{
				method: "PUT",
				headers: { ...adminHeaders(), "x-upload-session": "https://session.url/abc" },
				body: new Uint8Array(10),
			},
			ENV,
		);

		expect(res.status).toBe(400);
		expect(mockForwardChunk).not.toHaveBeenCalled();
	});

	it("maps a YouTube 403 to a typed error response (no raw leak)", async () => {
		mockForwardChunk.mockRejectedValue(
			new AppError("YouTube: błąd podczas przesyłania fragmentu wideo", "UNAUTHORIZED", 403),
		);
		const api = createApi();
		const res = await api.request(
			"/api/video/upload-chunk",
			{ method: "PUT", headers: chunkHeaders("bytes 0-99/100"), body: new Uint8Array(100) },
			ENV,
		);

		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("błąd");
	});

	it("returns 401 without a session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/video/upload-chunk",
			{ method: "PUT", headers: chunkHeaders("bytes 0-99/100"), body: new Uint8Array(10) },
			ENV,
		);

		expect(res.status).toBe(401);
	});
});

const mockCreateVideo = vi.mocked(createVideo);

function confirmBody(overrides: Record<string, unknown> = {}) {
	return JSON.stringify({
		youtubeVideoId: "yt-abc",
		title: "Wakacje",
		description: "Opis",
		thumbnailUrl: "https://i.ytimg.com/h.jpg",
		...overrides,
	});
}

function uniqueViolation(): Error {
	const cause = new Error("pg dup");
	(cause as Error & { code?: string }).code = "23505";
	const err = new Error("Failed query: insert into videos");
	(err as Error & { cause?: unknown }).cause = cause;
	return err;
}

describe("POST /api/video/confirm", () => {
	beforeEach(() => {
		memberSession();
		mockCreateVideo.mockResolvedValue({
			id: "v-1",
			youtubeVideoId: "yt-abc",
			title: "Wakacje",
			description: "Opis",
			authorId: "u2",
			thumbnailUrl: "https://i.ytimg.com/h.jpg",
			createdAt: new Date(),
		});
	});

	it("writes the record with authorId from the session and returns 201 + thumbnail", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/video/confirm",
			{ method: "POST", headers: jsonHeaders(), body: confirmBody() },
			ENV,
		);

		expect(res.status).toBe(201);
		// authorId pochodzi z sesji (memberSession → u2), NIE z ciała żądania
		expect(mockCreateVideo).toHaveBeenCalledWith({
			youtubeVideoId: "yt-abc",
			title: "Wakacje",
			description: "Opis",
			authorId: "u2",
			thumbnailUrl: "https://i.ytimg.com/h.jpg",
		});
		const body = (await res.json()) as { data: { id: string; thumbnailUrl: string } };
		expect(body.data.id).toBe("v-1");
		expect(body.data.thumbnailUrl).toBe("https://i.ytimg.com/h.jpg");
	});

	it("returns 401 without a session", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/video/confirm",
			{ method: "POST", headers: jsonHeaders(), body: confirmBody() },
			ENV,
		);

		expect(res.status).toBe(401);
		expect(mockCreateVideo).not.toHaveBeenCalled();
	});

	it("returns 400 when the thumbnailUrl is invalid", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/video/confirm",
			{ method: "POST", headers: jsonHeaders(), body: confirmBody({ thumbnailUrl: "not-a-url" }) },
			ENV,
		);

		expect(res.status).toBe(400);
		expect(mockCreateVideo).not.toHaveBeenCalled();
	});

	it("returns 409 when the video was already saved (unique violation)", async () => {
		mockCreateVideo.mockRejectedValue(uniqueViolation());
		const api = createApi();
		const res = await api.request(
			"/api/video/confirm",
			{ method: "POST", headers: jsonHeaders(), body: confirmBody() },
			ENV,
		);

		expect(res.status).toBe(409);
	});
});

const mockDeleteYoutube = vi.mocked(deleteYoutubeVideo);
const mockDeleteRecord = vi.mocked(deleteVideo);
const mockDeleteAlbumItemsByRefs = vi.mocked(deleteAlbumItemsByRefs);
const mockGetVideo = vi.mocked(getVideoById);

/** Rekord wideo z autorem — kształt `VideoFeedItem` zwracany przez getVideoById. */
function videoRow(
	overrides: Partial<{ id: string; youtubeVideoId: string; authorId: string }> = {},
) {
	return {
		id: "v-1",
		youtubeVideoId: "yt-1",
		title: "Wakacje",
		description: null,
		authorId: "u2",
		thumbnailUrl: "https://i.ytimg.com/vi/yt-1/hqdefault.jpg",
		createdAt: new Date(),
		author: { id: "u2", name: "Kasia" },
		...overrides,
	};
}

describe("DELETE /api/video/:id", () => {
	beforeEach(() => {
		connectedYoutube();
		mockDeleteYoutube.mockResolvedValue(undefined);
		mockDeleteRecord.mockResolvedValue(videoRow() as never);
	});

	it("lets the author delete their own video (YouTube + Neon) and returns 200", async () => {
		memberSession(); // u2
		mockGetVideo.mockResolvedValue(videoRow({ authorId: "u2" }));

		const api = createApi();
		const res = await api.request(
			"/api/video/v-1",
			{ method: "DELETE", headers: adminHeaders() },
			ENV,
		);

		expect(res.status).toBe(200);
		expect(mockDeleteYoutube).toHaveBeenCalledWith("yt-1", "ya29", expect.any(Object));
		expect(mockDeleteRecord).toHaveBeenCalledWith("v-1");
		const body = (await res.json()) as { data: { id: string } };
		expect(body.data.id).toBe("v-1");
	});

	it("lets an admin delete any video", async () => {
		adminSession(); // u1 admin
		mockGetVideo.mockResolvedValue(videoRow({ authorId: "u2" })); // cudze wideo

		const api = createApi();
		const res = await api.request(
			"/api/video/v-1",
			{ method: "DELETE", headers: adminHeaders() },
			ENV,
		);

		expect(res.status).toBe(200);
		expect(mockDeleteYoutube).toHaveBeenCalledWith("yt-1", expect.any(String), expect.any(Object));
		expect(mockDeleteRecord).toHaveBeenCalledWith("v-1");
	});

	it("returns 403 for a non-author non-admin and touches neither YouTube nor Neon", async () => {
		memberSession(); // u2
		mockGetVideo.mockResolvedValue(videoRow({ authorId: "u1" })); // cudze wideo

		const api = createApi();
		const res = await api.request(
			"/api/video/v-1",
			{ method: "DELETE", headers: adminHeaders() },
			ENV,
		);

		expect(res.status).toBe(403);
		expect(mockDeleteYoutube).not.toHaveBeenCalled();
		expect(mockDeleteRecord).not.toHaveBeenCalled();
	});

	it("returns 404 when the video does not exist", async () => {
		memberSession();
		mockGetVideo.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/video/missing",
			{ method: "DELETE", headers: adminHeaders() },
			ENV,
		);

		expect(res.status).toBe(404);
		expect(mockDeleteYoutube).not.toHaveBeenCalled();
		expect(mockDeleteRecord).not.toHaveBeenCalled();
	});

	it("returns 503 when YouTube is not connected and does not delete the Neon record", async () => {
		memberSession();
		mockGetVideo.mockResolvedValue(videoRow({ authorId: "u2" }));
		mockGetToken.mockResolvedValue(null); // brak refresh tokenu → 503

		const api = createApi();
		const res = await api.request(
			"/api/video/v-1",
			{ method: "DELETE", headers: adminHeaders() },
			ENV,
		);

		expect(res.status).toBe(503);
		expect(mockDeleteYoutube).not.toHaveBeenCalled();
		expect(mockDeleteRecord).not.toHaveBeenCalled();
	});

	it("is atomic: a YouTube delete failure leaves the Neon record untouched", async () => {
		memberSession();
		mockGetVideo.mockResolvedValue(videoRow({ authorId: "u2" }));
		mockDeleteYoutube.mockRejectedValue(
			new AppError("YouTube: błąd podczas usuwania wideo", "UNAUTHORIZED", 403),
		);

		const api = createApi();
		const res = await api.request(
			"/api/video/v-1",
			{ method: "DELETE", headers: adminHeaders() },
			ENV,
		);

		expect(res.status).toBe(403);
		expect(mockDeleteRecord).not.toHaveBeenCalled();
	});

	it("returns 401 without a session", async () => {
		mockVerify.mockResolvedValue(null);

		const api = createApi();
		const res = await api.request(
			"/api/video/v-1",
			{ method: "DELETE", headers: { Cookie: "session=x" } },
			ENV,
		);

		expect(res.status).toBe(401);
	});
});

// Kaskada F5 (#174): usunięcie wideo wyciąga je (kind = "video", ref = id
// wiersza) ze wszystkich albumów w tej samej operacji co usunięcie rekordu.
describe("DELETE /api/video/:id — kaskada albumów (#174)", () => {
	beforeEach(() => {
		connectedYoutube();
		mockDeleteYoutube.mockResolvedValue(undefined);
		mockDeleteRecord.mockResolvedValue(videoRow() as never);
	});

	it("removes the video from all albums when the video is deleted", async () => {
		memberSession(); // u2 — autor
		mockGetVideo.mockResolvedValue(videoRow({ id: "v-1", authorId: "u2" }));

		const api = createApi();
		const res = await api.request(
			"/api/video/v-1",
			{ method: "DELETE", headers: adminHeaders() },
			ENV,
		);

		expect(res.status).toBe(200);
		expect(mockDeleteRecord).toHaveBeenCalledWith("v-1");
		expect(mockDeleteAlbumItemsByRefs).toHaveBeenCalledWith({ kind: "video", refs: ["v-1"] });
	});
});
