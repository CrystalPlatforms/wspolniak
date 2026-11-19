// SPDX-License-Identifier: AGPL-3.0-or-later
declare namespace Cloudflare {
	interface Env {
		VAPID_PUBLIC_KEY?: string;
		VAPID_PRIVATE_KEY?: string;
		VAPID_SUBJECT?: string;
		// Wspólniak Wideo — YouTube OAuth + refresh-token encryption.
		// Secrets live in .dev.vars / Cloudflare dashboard; declared optional so
		// the app can detect "not configured" and tell the admin.
		YOUTUBE_CLIENT_ID?: string;
		YOUTUBE_CLIENT_SECRET?: string;
		YOUTUBE_TOKEN_ENCRYPTION_KEY?: string;
		// Optional override of the OAuth redirect URI. Needed in dev because Google
		// rejects LAN-IP / non-public redirect URIs for Production-status Web clients
		// (localhost is the only loopback Google allows). Defaults to ${APP_URL}/api/video/oauth/callback.
		YOUTUBE_REDIRECT_URI?: string;
	}
}
