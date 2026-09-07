// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "@/core/errors";
import {
	buildAuthorizationUrl,
	type ChunkRange,
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
	type YoutubeConfig,
} from "@/core/youtube";
import {
	clearYoutubeConnection,
	getYoutubeConnection,
	getYoutubeRefreshToken,
	setYoutubeConnection,
} from "@/db/instance";
import {
	confirmVideoSchema,
	countTodayUTC,
	DAILY_VIDEO_LIMIT,
	logUploadEvent,
	MAX_VIDEO_BYTES,
	startUploadSchema,
	youtubeDeleteSchema,
} from "@/db/video-uploads";
import { createHono, getOrigin } from "@/hono/factory";
import { adminMiddleware } from "@/hono/middleware/admin";
import { authMiddleware } from "@/hono/middleware/auth";

const videoEndpoint = createHono();

// Auth: every video route requires a session; oauth + connection are admin-only.
// Upload routes (F2) are member-authenticated — any logged-in family member can upload.
videoEndpoint.use("*", authMiddleware());
videoEndpoint.use("/oauth/*", adminMiddleware());
videoEndpoint.use("/connection", adminMiddleware());

/** Derives the YouTube config + raw encryption key from env, or null if unset. */
function youtubeEnv(env: Env): { config: YoutubeConfig; encryptionKeyRaw: string } | null {
	const origin = env.APP_URL;
	const clientId = env.YOUTUBE_CLIENT_ID;
	const clientSecret = env.YOUTUBE_CLIENT_SECRET;
	const encryptionKeyRaw = env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
	if (!origin || !clientId || !clientSecret || !encryptionKeyRaw) {
		return null;
	}
	return {
		encryptionKeyRaw,
		config: {
			clientId,
			clientSecret,
			redirectUri: env.YOUTUBE_REDIRECT_URI ?? `${origin}/api/video/oauth/callback`,
			// SESSION_SECRET already signs session cookies; reuse it to sign the OAuth
			// state (CSRF). Token encryption uses YOUTUBE_TOKEN_ENCRYPTION_KEY separately.
			stateSecret: env.SESSION_SECRET,
		},
	};
}

/**
 * Rozwiązuje access token YouTube dla bieżącej instancji: odszyfrowowuje refresh
 * token z instance settings i mintuje access token. Zwraca `Response` (503), gdy
 * instancja nie jest skonfigurowana/połączona — handler zwraca go bezpośrednio.
 * Rzucane AppError (np. revoke tokenu) łapie handler i mapuje na status HTTP.
 */
async function resolveUploadContext(
	c: Context,
): Promise<{ accessToken: string; config: YoutubeConfig } | Response> {
	const cfg = youtubeEnv(c.env);
	if (!cfg) return c.json({ error: "YouTube nie jest skonfigurowane" }, 503);

	const tokenRow = await getYoutubeRefreshToken();
	if (!tokenRow) return c.json({ error: "Najpierw połącz kanał YouTube" }, 503);

	const encryptionKey = await importEncryptionKey(cfg.encryptionKeyRaw);
	const refreshToken = await decryptRefreshToken(tokenRow.encryptedRefreshToken, encryptionKey);
	const { accessToken } = await refreshAccessToken(refreshToken, cfg.config);
	return { accessToken, config: cfg.config };
}

// GET /api/video/oauth/start — redirect the admin to Google's consent screen.
videoEndpoint.get("/oauth/start", async (c) => {
	const cfg = youtubeEnv(c.env);
	if (!cfg) return c.json({ error: "YouTube nie jest skonfigurowane" }, 503);

	const admin = c.get("user");
	const state = await createState(admin.userId, cfg.config);
	return c.redirect(buildAuthorizationUrl(state, cfg.config));
});

// GET /api/video/oauth/callback — Google redirects back here with ?code&state.
videoEndpoint.get("/oauth/callback", async (c) => {
	const cfg = youtubeEnv(c.env);
	if (!cfg) return c.json({ error: "YouTube nie jest skonfigurowane" }, 503);

	if (c.req.query("error")) {
		return c.redirect(`${getOrigin(c)}/app/admin?youtube=error`);
	}

	const code = c.req.query("code");
	const state = c.req.query("state");
	if (!code || !state) {
		return c.json({ error: "Brak kodu autoryzacji" }, 400);
	}

	const verified = await verifyState(state, cfg.config);
	if (!verified) {
		return c.json({ error: "Nieprawidłowy stan (CSRF)" }, 400);
	}

	try {
		const tokens = await exchangeCodeForTokens(code, cfg.config);
		const channel = await fetchOwnChannel(tokens.accessToken, cfg.config);
		const encryptionKey = await importEncryptionKey(cfg.encryptionKeyRaw);
		const encryptedRefreshToken = await encryptRefreshToken(tokens.refreshToken, encryptionKey);

		await setYoutubeConnection({
			channelId: channel.id,
			channelTitle: channel.title,
			encryptedRefreshToken,
			connectedBy: verified.adminUserId,
		});

		return c.redirect(`${getOrigin(c)}/app/admin?youtube=connected`);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		const status = e instanceof AppError ? ` [${e.status}]` : "";
		const reason = encodeURIComponent(`${msg}${status}`);
		return c.redirect(`${getOrigin(c)}/app/admin?youtube=error&reason=${reason}`);
	}
});

// GET /api/video/connection — current connection status (channel name etc.).
videoEndpoint.get("/connection", async (c) => {
	const connection = await getYoutubeConnection();
	return c.json({ data: connection });
});

// DELETE /api/video/connection — disconnect (clears every youtube field).
videoEndpoint.delete("/connection", async (c) => {
	await clearYoutubeConnection();
	return c.json({ data: { ok: true } });
});

// POST /api/video/upload-session — start a resumable YouTube upload session.
// Daily limit (3/day, UTC) is enforced BEFORE any YouTube call.
videoEndpoint.post("/upload-session", async (c) => {
	const parsed = startUploadSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
	}
	if (parsed.data.size > MAX_VIDEO_BYTES) {
		return c.json({ error: "Plik jest za duży (max 2 GB)" }, 413);
	}

	const todayCount = await countTodayUTC();
	if (todayCount >= DAILY_VIDEO_LIMIT) {
		return c.json({ error: `Osiągnięto dzienny limit wideo (${DAILY_VIDEO_LIMIT})` }, 429);
	}

	try {
		const resolved = await resolveUploadContext(c);
		if (resolved instanceof Response) return resolved;

		const { sessionUrl } = await startResumableUpload(
			resolved.accessToken,
			{
				title: parsed.data.title,
				description: parsed.data.description,
				size: parsed.data.size,
				mime: parsed.data.mime,
			},
			resolved.config,
		);
		return c.json({ data: { sessionUrl } }, 201);
	} catch (e) {
		if (e instanceof AppError)
			return c.json({ error: e.message }, e.status as ContentfulStatusCode);
		throw e;
	}
});

/** Parsuje `Content-Range: bytes start-end/total` → ChunkRange, lub null. */
function parseContentRange(header?: string | null): ChunkRange | null {
	if (!header) return null;
	const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header);
	if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined) return null;
	return { start: Number(m[1]), end: Number(m[2]), total: Number(m[3]) };
}

// PUT /api/video/upload-chunk — forward a single chunk to the YouTube session
// (Worker → YouTube, server-to-server). Range in Content-Range, session URL in
// a custom header; the body is the raw chunk stream.
videoEndpoint.put("/upload-chunk", async (c) => {
	const range = parseContentRange(c.req.header("content-range"));
	if (!range) return c.json({ error: "Brak lub wadliwy nagłówek Content-Range" }, 400);
	const sessionUrl = c.req.header("x-upload-session");
	if (!sessionUrl) return c.json({ error: "Brak nagłówka sesji uploadu" }, 400);

	try {
		const resolved = await resolveUploadContext(c);
		if (resolved instanceof Response) return resolved;

		const body = c.req.raw.body;
		if (!body) return c.json({ error: "Pusty fragment wideo" }, 400);

		const result = await forwardChunk(
			resolved.accessToken,
			sessionUrl,
			range,
			body,
			resolved.config,
		);
		return c.json({ data: result });
	} catch (e) {
		if (e instanceof AppError)
			return c.json({ error: e.message }, e.status as ContentfulStatusCode);
		throw e;
	}
});

// POST /api/video/confirm — passthrough (Video v2 #194): NIC nie zapisuje.
// `youtubeVideoId` + `thumbnailUrl` pochodzą z odpowiedzi ostatniego chunka;
// klient osadza je w payloadzie posta. Zapis do `video_upload_events` podtrzymuje
// dzienny limit (3 udane uploady / dzień — ta sama semantyka, co stare wiersze
// `videos`, tylko liczona przy confirm zamiast przy osobnym persist).
videoEndpoint.post("/confirm", async (c) => {
	const user = c.get("user");
	const parsed = confirmVideoSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
	}

	await logUploadEvent(user.userId);
	return c.json({
		data: { youtubeVideoId: parsed.data.youtubeVideoId, thumbnailUrl: parsed.data.thumbnailUrl },
	});
});

// POST /api/video/yt-delete — JEDNA serwerowa zdolność usuwania klipu z YouTube
// (Video v2 F3 #197, us stories 13–15). Fire-and-forget: 202 wraca natychmiast,
// a błąd YouTube (quota/sieć/brak połączenia) jest TYLKO logowany — nigdy nie
// wywraca akcji użytkownika; ewentualne resztki pozostają unlisted i niewidoczne.
videoEndpoint.post("/yt-delete", async (c) => {
	const parsed = youtubeDeleteSchema.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
	}

	fireAndForgetYoutubeDelete(c.executionCtx, c.env, parsed.data.youtubeVideoId);
	return c.json({ data: { ok: true } }, 202);
});

/**
 * Usuwa klip z YouTube w tle (YouTube Data API videos.delete, admin OAuth).
 * Jedyna droga usuwania z YouTube w aplikacji — wołana z endpointu /yt-delete
 * (usuwanie z edycji) i z kaskady usuwania posta. Jakikolwiek błąd ląduje w
 * logu; użytkownik nigdy nie dostaje błędu z tej ścieżki (#197).
 */
export function fireAndForgetYoutubeDelete(
	executionCtx: { waitUntil: (promise: Promise<unknown>) => void },
	env: Env,
	youtubeVideoId: string,
): void {
	executionCtx.waitUntil(
		(async () => {
			try {
				const cfg = youtubeEnv(env);
				if (!cfg) {
					// biome-ignore lint/suspicious/noConsole: log w Workerze — bez tego utrata delete jest niewidoczna
					console.warn("[video] YouTube delete skipped — not configured:", youtubeVideoId);
					return;
				}
				const tokenRow = await getYoutubeRefreshToken();
				if (!tokenRow) {
					// biome-ignore lint/suspicious/noConsole: log w Workerze — bez tego utrata delete jest niewidoczna
					console.warn("[video] YouTube delete skipped — channel not connected:", youtubeVideoId);
					return;
				}
				const encryptionKey = await importEncryptionKey(cfg.encryptionKeyRaw);
				const refreshToken = await decryptRefreshToken(
					tokenRow.encryptedRefreshToken,
					encryptionKey,
				);
				const { accessToken } = await refreshAccessToken(refreshToken, cfg.config);
				await deleteYoutubeVideo(youtubeVideoId, accessToken, cfg.config);
			} catch (e) {
				// biome-ignore lint/suspicious/noConsole: jedyny ślad po nieudanym delete — wymóg AC #197
				console.error(
					"[video] YouTube delete failed (leftover stays unlisted):",
					youtubeVideoId,
					e,
				);
			}
		})(),
	);
}

export default videoEndpoint;
