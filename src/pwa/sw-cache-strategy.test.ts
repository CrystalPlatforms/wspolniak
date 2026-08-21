// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests for public/sw.js caching strategy.
// Repro for issue #62 — stale SW cache served outdated JS bundles after deploy.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Listener = (event: unknown) => void;

interface FakeCache {
	store: Map<string, Response>;
	match: (req: Request | string) => Promise<Response | undefined>;
	put: (req: Request | string, res: Response) => Promise<void>;
	addAll: (urls: string[]) => Promise<void>;
}

interface FakeCacheStorage {
	caches: Map<string, FakeCache>;
	open: (name: string) => Promise<FakeCache>;
	keys: () => Promise<string[]>;
	delete: (name: string) => Promise<boolean>;
	match: (req: Request | string) => Promise<Response | undefined>;
}

function createFakeCache(): FakeCache {
	const store = new Map<string, Response>();
	return {
		store,
		async match(req) {
			const key = typeof req === "string" ? req : req.url;
			return store.get(key);
		},
		async put(req, res) {
			const key = typeof req === "string" ? req : req.url;
			store.set(key, res);
		},
		async addAll(urls) {
			for (const url of urls) {
				store.set(url, new Response("precached"));
			}
		},
	};
}

function createFakeCacheStorage(): FakeCacheStorage {
	const caches = new Map<string, FakeCache>();
	return {
		caches,
		async open(name) {
			let cache = caches.get(name);
			if (!cache) {
				cache = createFakeCache();
				caches.set(name, cache);
			}
			return cache;
		},
		async keys() {
			return Array.from(caches.keys());
		},
		async delete(name) {
			return caches.delete(name);
		},
		async match(req) {
			for (const cache of caches.values()) {
				const hit = await cache.match(req);
				if (hit) return hit;
			}
			return undefined;
		},
	};
}

interface SwEnv {
	listeners: Map<string, Listener>;
	fetchMock: ReturnType<typeof vi.fn>;
	cacheStorage: FakeCacheStorage;
	cacheName: string;
}

const TEST_BUILD_ID = "testbuild1234";

function loadSw(opts: { hostname?: string; origin?: string } = {}): SwEnv {
	const hostname = opts.hostname ?? "wspolniak.com";
	const origin = opts.origin ?? "https://wspolniak.com";
	const path = resolve(import.meta.dirname, "..", "..", "public", "sw.js");
	const rawSource = readFileSync(path, "utf-8");
	// Simulate what scripts/inject-sw-version.mjs does at build time.
	const source = rawSource.replaceAll("__BUILD_ID__", TEST_BUILD_ID);

	const listeners = new Map<string, Listener>();
	const fetchMock = vi.fn();
	const cacheStorage = createFakeCacheStorage();

	const self = {
		addEventListener: (event: string, listener: Listener) => {
			listeners.set(event, listener);
		},
		skipWaiting: vi.fn(),
		clients: { claim: vi.fn(), matchAll: vi.fn() },
		registration: { showNotification: vi.fn() },
		location: { origin, hostname },
	};

	const captured: { cacheName?: string } = {};
	const sandbox = new Function(
		"self",
		"caches",
		"fetch",
		"Response",
		"Request",
		"URL",
		"clients",
		"__capture",
		`${source}\n__capture.cacheName = CACHE_NAME;`,
	);
	sandbox(self, cacheStorage, fetchMock, Response, Request, URL, self.clients, captured);

	return { listeners, fetchMock, cacheStorage, cacheName: captured.cacheName ?? "" };
}

function makeFetchEvent(url: string, mode: "navigate" | "no-cors" = "no-cors") {
	const request = new Request(url);
	if (mode === "navigate") {
		Object.defineProperty(request, "mode", { value: "navigate", configurable: true });
	}
	let responded: Promise<Response> | undefined;
	return {
		request,
		respondWith: (p: Promise<Response>) => {
			responded = p;
		},
		get responded() {
			return responded;
		},
	};
}

describe("public/sw.js caching strategy (issue #62)", () => {
	describe("CACHE_NAME bumping", () => {
		it("source contains __BUILD_ID__ placeholder for post-build injection", () => {
			const path = resolve(import.meta.dirname, "..", "..", "public", "sw.js");
			const rawSource = readFileSync(path, "utf-8");
			expect(rawSource).toContain("__BUILD_ID__");
		});

		it("includes a build identifier so new deploys evict old caches", () => {
			const { cacheName } = loadSw();
			// A static name like "wspolniak-v1" was the bug: it never changed between
			// deploys, so the activate cleanup never deleted the stale cache.
			expect(cacheName).not.toBe("wspolniak-v1");
			expect(cacheName).toBe(`wspolniak-${TEST_BUILD_ID}`);
		});

		it("activate handler deletes caches that don't match current CACHE_NAME", async () => {
			const { listeners, cacheStorage, cacheName } = loadSw();
			// Seed stale caches from previous deploys.
			await cacheStorage.open("wspolniak-v1");
			await cacheStorage.open("wspolniak-old-build-hash");
			await cacheStorage.open(cacheName);

			const activate = listeners.get("activate");
			expect(activate).toBeDefined();

			const waits: Promise<unknown>[] = [];
			activate?.({ waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown);
			await Promise.all(waits);

			const remaining = await cacheStorage.keys();
			expect(remaining).toEqual([cacheName]);
		});
	});

	describe("HTML navigation: network-first", () => {
		it("fetches fresh HTML from network on every navigation, falls back to cache offline", async () => {
			const { listeners, cacheStorage, fetchMock } = loadSw();

			// Pre-populate cache with STALE HTML pointing at an old bundle hash.
			const cache = await cacheStorage.open((await cacheStorage.keys())[0] ?? "wspolniak");
			await cache.put("https://wspolniak.com/", new Response('<html data-version="old"></html>'));

			// Network returns FRESH HTML pointing at the new bundle hash.
			const freshHtml = new Response('<html data-version="new"></html>', { status: 200 });
			fetchMock.mockResolvedValueOnce(freshHtml);

			const fetchHandler = listeners.get("fetch");
			expect(fetchHandler).toBeDefined();

			const event = makeFetchEvent("https://wspolniak.com/", "navigate");
			fetchHandler?.(event as unknown);

			const response = await event.responded;
			expect(response).toBeDefined();
			const text = await response?.text();
			// Bug repro: cache-first returns the STALE html. Fix: network-first returns FRESH.
			expect(text).toContain('data-version="new"');
			expect(fetchMock).toHaveBeenCalled();
		});
	});

	describe("HTML navigation /app: network-first with offline fallback (#148)", () => {
		it("serves fresh SSR HTML from network when online and caches the /app shell", async () => {
			const { listeners, cacheStorage, fetchMock } = loadSw();
			const fetchHandler = listeners.get("fetch");
			expect(fetchHandler).toBeDefined();

			const freshHtml = new Response('<html data-view="app-fresh"></html>', { status: 200 });
			fetchMock.mockResolvedValueOnce(freshHtml);

			const event = makeFetchEvent("https://wspolniak.com/app", "navigate");
			fetchHandler?.(event as unknown);

			const response = await event.responded;
			expect(await response?.text()).toContain("app-fresh");
			expect(fetchMock).toHaveBeenCalled();

			// Response cached so the next offline cold start has a fallback.
			const cache = await cacheStorage.open(`wspolniak-${TEST_BUILD_ID}`);
			const cached = await cache.match("https://wspolniak.com/app");
			expect(cached).toBeDefined();
			expect(await cached?.text()).toContain("app-fresh");
		});

		it("falls back to the cached /app shell when the network fails (offline cold start)", async () => {
			const { listeners, cacheStorage, fetchMock } = loadSw();

			// Seed the cache the way a previous online visit would have.
			const cache = await cacheStorage.open(`wspolniak-${TEST_BUILD_ID}`);
			await cache.put(
				"https://wspolniak.com/app",
				new Response('<html data-view="app-cached"></html>'),
			);

			fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

			const fetchHandler = listeners.get("fetch");
			const event = makeFetchEvent("https://wspolniak.com/app", "navigate");
			fetchHandler?.(event as unknown);

			const response = await event.responded;
			expect(await response?.text()).toContain("app-cached");
		});

		it("leaves /app deep links untouched — only the feed shell (start_url) is cached", async () => {
			const { listeners, fetchMock } = loadSw();
			const fetchHandler = listeners.get("fetch");

			const event = makeFetchEvent("https://wspolniak.com/app/video", "navigate");
			fetchHandler?.(event as unknown);

			expect(event.responded).toBeUndefined();
			expect(fetchMock).not.toHaveBeenCalled();
		});
	});

	describe("Static assets on localhost (dev): network-first", () => {
		it("serves fresh JS from network even when a stale copy is cached", async () => {
			const { listeners, cacheStorage, fetchMock } = loadSw({
				hostname: "localhost",
				origin: "http://localhost:3000",
			});

			// Pre-populate cache with a STALE JS bundle.
			const cache = await cacheStorage.open((await cacheStorage.keys())[0] ?? "wspolniak");
			await cache.put(
				"http://localhost:3000/assets/app.js",
				new Response("STALE-BUNDLE", { status: 200 }),
			);

			// Network returns a FRESH JS bundle.
			fetchMock.mockResolvedValueOnce(new Response("FRESH-BUNDLE", { status: 200 }));

			const fetchHandler = listeners.get("fetch");
			expect(fetchHandler).toBeDefined();

			const event = makeFetchEvent("http://localhost:3000/assets/app.js");
			fetchHandler?.(event as unknown);

			const response = await event.responded;
			expect(response).toBeDefined();
			const text = await response?.text();
			// Network-first on localhost: returns FRESH, never the stale cache. Fix
			// for "must hard-refresh in dev" — vite rewrites bundle contents under
			// the same URL, so cache-first would serve stale forever.
			expect(text).toBe("FRESH-BUNDLE");
			expect(fetchMock).toHaveBeenCalled();
		});

		it("still uses cache-first in production (non-localhost) for static assets", async () => {
			const { listeners, cacheStorage, fetchMock } = loadSw();

			const cache = await cacheStorage.open((await cacheStorage.keys())[0] ?? "wspolniak");
			await cache.put(
				"https://wspolniak.com/assets/app.js",
				new Response("CACHED-BUNDLE", { status: 200 }),
			);

			const fetchHandler = listeners.get("fetch");
			expect(fetchHandler).toBeDefined();

			const event = makeFetchEvent("https://wspolniak.com/assets/app.js");
			fetchHandler?.(event as unknown);

			const response = await event.responded;
			expect(response).toBeDefined();
			const text = await response?.text();
			// Cache-first in production: serves cached bundle without hitting network.
			expect(text).toBe("CACHED-BUNDLE");
			expect(fetchMock).not.toHaveBeenCalled();
		});
	});
});
