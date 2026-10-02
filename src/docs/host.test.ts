// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Host-based serving branch (F1 #204) — jednostkowe testy logiki entry Workera.
 * src/server.ts jest za ciężki do bezpośredniego testu (ciągnie Hono, DB, ChatRoom),
 * więc CAŁA decyzja hostowa żyje w czystych funkcjach tu testowanych, a server.ts
 * tylko je wywołuje (deep module).
 *
 * Założenia zakodowane w testach:
 * - „docs host" = hostname z prefiksem `docs.` — to wystarcza dla docs.wspolniak.com
 *   (prod) i docs.localhost (dev); brak allowlisty domen.
 * - Dev localhost (i 127.0.0.1, *.localhost) renderuje ścieżki docsów BEZPOŚREDNIO —
 *   bez zależności od działającego DNS.
 * - `/docs` (exact) 301-uje na docs landing na KAŻDYM hostzie — stary landing
 *   przejęła subdomena; ścieżka `/docs/big-photo` NIE jest dotykana (żyje do F4).
 * - Produkcyjny host apki kanonizuje tylko ścieżki docsów (/product, /technical,
 *   /bugs, /credits + ich podścieżki) — żaden inny path nie może wyjść z apki.
 * - NIE testujemy tu: samego fetch Workera (HITL przez pnpm dev), DNS/prod.
 */
import { describe, expect, it } from "vitest";
import { docsOrigin, isDocsHostname, isLocalHostname, resolveDocsRedirect } from "./host";

describe("isDocsHostname", () => {
	it("rozpoznaje subdomenę docsów (prod i dev)", () => {
		expect(isDocsHostname("docs.wspolniak.com")).toBe(true);
		expect(isDocsHostname("docs.localhost")).toBe(true);
	});

	it("odrzuca zwykły host apki", () => {
		expect(isDocsHostname("wspolniak.com")).toBe(false);
		expect(isDocsHostname("wspolniak-dev.workers.dev")).toBe(false);
		expect(isDocsHostname("localhost")).toBe(false);
	});
});

describe("isLocalHostname", () => {
	it("rozpoznaje loopback we wszystkich wariantach", () => {
		expect(isLocalHostname("localhost")).toBe(true);
		expect(isLocalHostname("127.0.0.1")).toBe(true);
		expect(isLocalHostname("[::1]")).toBe(true);
		expect(isLocalHostname("docs.localhost")).toBe(true);
	});

	it("odrzuca zdalne hosty", () => {
		expect(isLocalHostname("wspolniak.com")).toBe(false);
		expect(isLocalHostname("docs.wspolniak.com")).toBe(false);
	});
});

describe("docsOrigin", () => {
	it("dokleja docs. z zachowaniem portu (dev)", () => {
		expect(docsOrigin("http://localhost:3000")).toBe("http://docs.localhost:3000");
	});

	it("dokleja docs. bez portu (prod)", () => {
		expect(docsOrigin("https://wspolniak.com")).toBe("https://docs.wspolniak.com");
	});
});

describe("resolveDocsRedirect (logika entry Workera z mockowanym Hostem)", () => {
	it("exact /docs 301-uje na docs landing na produkcyjnym hostzie", () => {
		expect(resolveDocsRedirect("/docs", "https://wspolniak.com")).toEqual({
			status: 301,
			location: "https://docs.wspolniak.com/",
		});
	});

	it("exact /docs 301-uje na docs landing też na localhost (z portem)", () => {
		expect(resolveDocsRedirect("/docs", "http://localhost:3000")).toEqual({
			status: 301,
			location: "http://docs.localhost:3000/",
		});
	});

	it("nie dotyka /docs/big-photo (stary artykuł żyje do migracji F4)", () => {
		expect(resolveDocsRedirect("/docs/big-photo", "https://wspolniak.com")).toBeNull();
	});

	it("host docs.* renderuje ścieżki docsów bezpośrednio", () => {
		expect(resolveDocsRedirect("/product/feed-and-posts", "https://docs.wspolniak.com")).toBeNull();
		expect(resolveDocsRedirect("/credits", "http://docs.localhost:3000")).toBeNull();
	});

	it("dev localhost renderuje ścieżki docsów bezpośrednio", () => {
		expect(resolveDocsRedirect("/product/feed-and-posts", "http://localhost:3000")).toBeNull();
		expect(resolveDocsRedirect("/technical/stack", "http://127.0.0.1:3000")).toBeNull();
	});

	it("produkcyjny host apki kanonizuje /product/* i /credits na subdomenę", () => {
		expect(resolveDocsRedirect("/product/feed-and-posts", "https://wspolniak.com")).toEqual({
			status: 301,
			location: "https://docs.wspolniak.com/product/feed-and-posts",
		});
		expect(resolveDocsRedirect("/credits", "https://wspolniak.com")).toEqual({
			status: 301,
			location: "https://docs.wspolniak.com/credits",
		});
	});

	it("kanonizuje też podścieżki z sufiksem (/product/...), ale nie inne ścieżki apki", () => {
		expect(resolveDocsRedirect("/product", "https://wspolniak.com")).not.toBeNull();
		expect(resolveDocsRedirect("/productx", "https://wspolniak.com")).toBeNull();
		expect(resolveDocsRedirect("/app", "https://wspolniak.com")).toBeNull();
		expect(resolveDocsRedirect("/", "https://wspolniak.com")).toBeNull();
		expect(resolveDocsRedirect("/api/posts", "https://wspolniak.com")).toBeNull();
	});
});
