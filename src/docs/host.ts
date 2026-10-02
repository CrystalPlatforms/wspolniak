// SPDX-License-Identifier: AGPL-3.0-or-later
// Host-based serving branch dla docsów (F1 #204): dowolny host `docs.*` serwuje docsy,
// każdy inny host trzyma dzisiejszą apkę i 301-kanonizuje ścieżki docsów na subdomenę.
// Dev localhost renderuje ścieżki docsów bezpośrednio (browsers rozwiązują *.localhost
// na loopback), więc lokalne HITL nie wymaga żadnej konfiguracji.

const DOCS_HOST_PREFIX = "docs.";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Ścieżki docsów kanonizowane 301 na subdomenę docs.* z produkcyjnego hosta apki. */
const DOCS_ONLY_PATHS = ["/product", "/technical", "/bugs", "/credits"] as const;

export function isDocsHostname(hostname: string): boolean {
	return hostname.startsWith(DOCS_HOST_PREFIX);
}

export function isLocalHostname(hostname: string): boolean {
	return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost");
}

/**
 * Origin subdomeny docsów dla danego originu apki: dokleja `docs.` przed hostname,
 * zachowując port (http://localhost:3000 → http://docs.localhost:3000,
 * https://wspolniak.com → https://docs.wspolniak.com).
 */
export function docsOrigin(origin: string): string {
	const url = new URL(origin);
	// Idempotentnie: host już-docs zostaje bez zmian (redirecty /docs/* z hosta
	// docs.* nie mogą produkować docs.docs.*).
	if (!url.hostname.startsWith(DOCS_HOST_PREFIX)) {
		url.hostname = `${DOCS_HOST_PREFIX}${url.hostname}`;
	}
	return url.origin;
}

/**
 * Origin głównego hosta apki z originu docsów: zdejmuje prefiks `docs.`
 * (http://docs.localhost:3000 → http://localhost:3000,
 * https://docs.wspolniak.com → https://wspolniak.com). Na zwykłym hostie apki
 * zwraca origin bez zmian.
 */
export function appOrigin(origin: string): string {
	const url = new URL(origin);
	if (url.hostname.startsWith(DOCS_HOST_PREFIX)) {
		url.hostname = url.hostname.slice(DOCS_HOST_PREFIX.length);
	}
	return url.origin;
}

export interface DocsRedirect {
	status: 301;
	location: string;
}

/**
 * Decyzja przekierowania dla żądania spoza SSR (worker entry). Zwraca 301 lub null
 * (null = SSR renderuje żądanie normalnie).
 * - `/docs` (exact) → docs landing na każdym hostzie (stary landing przejęty przez subdomenę).
 * - Host docs.* i dev localhost: ścieżki docsów renderują się bezpośrednio.
 * - Pozostałe (produkcyjne) hosty: ścieżki docsów 301-kanonizują na subdomenę docs.*.
 * - `/docs/big-photo` → `/bugs/big-photo` na subdomenie docsów (F4 #207) — artykuł zmigrowany
 *   do działu Błędy, stara trasa przestała istnieć.
 * - Pozostałe `/docs/*` → odpowiednik ścieżki głównej na subdomenie docsów (F4 #207): stare
 *   trasy /docs/* usunięte, redirect obowiązuje na każdym hostzie, też docs.*.
 */
export function resolveDocsRedirect(pathname: string, origin: string): DocsRedirect | null {
	if (pathname === "/docs") {
		return { status: 301, location: `${docsOrigin(origin)}/` };
	}

	// Stare trasy /docs/* usunięte (F4 #207) — redirect na każdym hostzie.
	if (pathname === "/docs/big-photo") {
		return { status: 301, location: `${docsOrigin(origin)}/bugs/big-photo` };
	}
	if (pathname.startsWith("/docs/")) {
		return { status: 301, location: `${docsOrigin(origin)}${pathname.slice("/docs".length)}` };
	}

	const { hostname } = new URL(origin);
	if (isDocsHostname(hostname) || isLocalHostname(hostname)) {
		return null;
	}

	for (const path of DOCS_ONLY_PATHS) {
		if (pathname === path || pathname.startsWith(`${path}/`)) {
			return { status: 301, location: `${docsOrigin(origin)}${pathname}` };
		}
	}

	return null;
}
