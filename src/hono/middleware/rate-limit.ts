// SPDX-License-Identifier: AGPL-3.0-or-later
import { createMiddleware } from "hono/factory";

export interface RateLimitOptions {
	/** Długość okna licznika (ms) — fixed window. */
	windowMs: number;
	/** Maksymalna liczba żądań na klucz w oknie. */
	max: number;
}

/** IP klienta: CF-Connecting-IP (Cloudflare) → pierwszy x-forwarded-for → fallback. */
function clientKey(headers: Headers): string {
	const cfIp = headers.get("cf-connecting-ip");
	if (cfIp) return cfIp.trim();
	const forwarded = headers.get("x-forwarded-for");
	const firstHop = forwarded?.split(",")[0]?.trim();
	return firstHop || "unknown";
}

/**
 * Rate limiter (#166) — reusable middleware per IP (fixed window). Stan trzyma
 * Map w pamięci isolate'a Workera: restart isolate'a resetuje licznik (dla
 * aplikacji rodzinnej wystarczające do utrudnienia brute-force kodu /share).
 */
export function createRateLimiter({ windowMs, max }: RateLimitOptions) {
	const hits = new Map<string, { count: number; expiresAt: number }>();

	return createMiddleware(async (c, next) => {
		const key = clientKey(c.req.raw.headers);
		const now = Date.now();
		const entry = hits.get(key);

		// Brak wpisu albo przeterminowany = świeże okno.
		if (!entry || entry.expiresAt <= now) {
			hits.set(key, { count: 1, expiresAt: now + windowMs });
			await next();
			return;
		}

		if (entry.count >= max) {
			return c.json({ error: "Too many requests" }, 429);
		}

		entry.count += 1;
		await next();
	});
}
