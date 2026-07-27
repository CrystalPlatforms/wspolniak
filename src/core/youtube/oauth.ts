// SPDX-License-Identifier: AGPL-3.0-or-later
// Google/YouTube OAuth + token lifecycle. Pure over an injected config and
// fetcher, so tests mock only the system boundary (Google's API), never our
// own modules.

import { AppError, type ErrorCode } from "@/core/errors";

export interface YoutubeConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	stateSecret: string;
}

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";

// upload (F2) + full youtube scope (channel read, delete) requested up front so
// the admin consents once and we never force a re-auth later.
const SCOPES = [
	"https://www.googleapis.com/auth/youtube.upload",
	"https://www.googleapis.com/auth/youtube",
].join(" ");

export function buildAuthorizationUrl(state: string, config: YoutubeConfig): string {
	const params = new URLSearchParams({
		client_id: config.clientId,
		redirect_uri: config.redirectUri,
		response_type: "code",
		scope: SCOPES,
		access_type: "offline",
		prompt: "consent",
		state,
	});
	return `${AUTH_ENDPOINT}?${params}`;
}

export async function exchangeCodeForTokens(
	code: string,
	config: YoutubeConfig,
	fetchFn: typeof fetch = fetch,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
	const body = new URLSearchParams({
		code,
		client_id: config.clientId,
		client_secret: config.clientSecret,
		redirect_uri: config.redirectUri,
		grant_type: "authorization_code",
	});
	const res = await fetchFn(TOKEN_ENDPOINT, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});
	if (!res.ok) throw youtubeError(res, "wymiany kodu autoryzacyjnego");

	const data = (await res.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
	};
	if (!data.access_token || !data.refresh_token || data.expires_in === undefined) {
		throw new AppError("YouTube: odpowiedź nie zawiera tokenu", "INTERNAL", 502);
	}
	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		expiresIn: data.expires_in,
	};
}

export async function refreshAccessToken(
	refreshToken: string,
	config: YoutubeConfig,
	fetchFn: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
	const body = new URLSearchParams({
		refresh_token: refreshToken,
		client_id: config.clientId,
		client_secret: config.clientSecret,
		grant_type: "refresh_token",
	});
	const res = await fetchFn(TOKEN_ENDPOINT, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});
	if (!res.ok) throw youtubeError(res, "odświeżania tokenu");

	const data = (await res.json()) as { access_token?: string; expires_in?: number };
	if (!data.access_token || data.expires_in === undefined) {
		throw new AppError("YouTube: odpowiedź nie zawiera tokenu", "INTERNAL", 502);
	}
	return { accessToken: data.access_token, expiresIn: data.expires_in };
}

export async function fetchOwnChannel(
	accessToken: string,
	_config: YoutubeConfig,
	fetchFn: typeof fetch = fetch,
): Promise<{ id: string; title: string }> {
	const params = new URLSearchParams({ part: "snippet", mine: "true" });
	const res = await fetchFn(`${CHANNELS_ENDPOINT}?${params}`, {
		headers: { authorization: `Bearer ${accessToken}` },
	});
	if (!res.ok) throw youtubeError(res, "pobierania kanału");

	const data = (await res.json()) as {
		items?: Array<{ id?: string; snippet?: { title?: string } }>;
	};
	const channel = data.items?.[0];
	if (!channel?.id || !channel.snippet?.title) {
		throw new AppError("Konto YouTube nie ma skonfigurowanego kanału", "NOT_FOUND", 404);
	}
	return { id: channel.id, title: channel.snippet.title };
}

// --- OAuth state (CSRF protection) ---------------------------------------

export async function createState(adminUserId: string, config: YoutubeConfig): Promise<string> {
	const nonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
	const inner = `${adminUserId}.${nonce}`;
	const mac = await hmacBase64Url(inner, config.stateSecret);
	return `${bytesToBase64Url(new TextEncoder().encode(inner))}.${mac}`;
}

export async function verifyState(
	state: string,
	config: YoutubeConfig,
): Promise<{ adminUserId: string } | null> {
	const dot = state.lastIndexOf(".");
	if (dot < 0) return null;

	let inner: string;
	try {
		inner = new TextDecoder().decode(base64UrlToBytes(state.slice(0, dot)));
	} catch {
		return null;
	}
	const expectedMac = await hmacBase64Url(inner, config.stateSecret);
	if (!constantTimeEqual(state.slice(dot + 1), expectedMac)) return null;

	const sep = inner.indexOf(".");
	if (sep < 0) return null;
	return { adminUserId: inner.slice(0, sep) };
}

// --- internals ------------------------------------------------------------

export function youtubeError(res: Response, action: string): AppError {
	const status = res.status;
	const code: ErrorCode =
		status === 401 || status === 403 || status === 400 ? "UNAUTHORIZED" : "INTERNAL";
	return new AppError(`YouTube: błąd podczas ${action}`, code, status);
}

async function hmacBase64Url(message: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
	return bytesToBase64Url(new Uint8Array(sig));
}

function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64url: string): Uint8Array {
	const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
