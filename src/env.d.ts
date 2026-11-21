// SPDX-License-Identifier: AGPL-3.0-or-later
// Uzupełnienie generowanego Env (worker-configuration.d.ts). Wrangler 4.x pomija
// w typegen klucze z prefiksem CLOUDFLARE_ (zarezerwowany dla CLI), a sekrety
// opcjonalne deklarujemy jako opcjonalne, żeby aplikacja umiała wykryć
// "nie skonfigurowano" i powiedzieć o tym adminowi. Wartości żyją w .dev.vars /
// .production.vars / Cloudflare dashboard — nigdy w tym repozytorium.
// Plik celowo BEZ import/export: tylko wtedy deklaracje mergują się globalnie.
declare namespace Cloudflare {
	interface Env {
		CLOUDFLARE_ENV: string;
		CLOUDFLARE_ACCOUNT_ID: string;
		CLOUDFLARE_IMAGES_API_TOKEN: string;
		CLOUDFLARE_IMAGES_ACCOUNT_HASH: string;
		VAPID_PUBLIC_KEY?: string;
		VAPID_PRIVATE_KEY?: string;
		VAPID_SUBJECT?: string;
		YOUTUBE_CLIENT_ID?: string;
		YOUTUBE_CLIENT_SECRET?: string;
		YOUTUBE_TOKEN_ENCRYPTION_KEY?: string;
		YOUTUBE_REDIRECT_URI?: string;
	}
}

interface Env {
	CLOUDFLARE_ENV: string;
	CLOUDFLARE_ACCOUNT_ID: string;
	CLOUDFLARE_IMAGES_API_TOKEN: string;
	CLOUDFLARE_IMAGES_ACCOUNT_HASH: string;
	VAPID_PUBLIC_KEY?: string;
	VAPID_PRIVATE_KEY?: string;
	VAPID_SUBJECT?: string;
	YOUTUBE_CLIENT_ID?: string;
	YOUTUBE_CLIENT_SECRET?: string;
	YOUTUBE_TOKEN_ENCRYPTION_KEY?: string;
	YOUTUBE_REDIRECT_URI?: string;
}
