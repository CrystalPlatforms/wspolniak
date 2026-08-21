// Service worker for Wspólniak — handles web push notifications and asset caching.
// Registered manually from src/components/pwa/pwa-shell.tsx.
// The build-id placeholder below is replaced at build time by
// scripts/inject-sw-version.mjs so each deploy gets a unique CACHE_NAME and
// the activate handler evicts the previous build's stale bundles. See GH #62.

const CACHE_NAME = "wspolniak-__BUILD_ID__";

const PRECACHE_URLS = ["/", "/manifest.webmanifest", "/logo192.png", "/favicon.ico"];

// Localhost = lokalny dev (vite). Tam pliki .js/.css zmieniają zawartość pod
// tym samym adresem przy każdej edycji (HMR), więc strategia cache-first
// serwowałaby stary bundle. Produkcja jest na innej domenie → cache-first.
const isLocalDev = self.location.hostname === "localhost";

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
			),
	);
	self.clients.claim();
});

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);

	// Only cache same-origin GET requests
	if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

	// Skip API calls — they need fresh data
	if (url.pathname.startsWith("/api/")) return;

	// HTML navigation: network-first so a fresh shell always references the
	// current build's hashed assets. Fall back to cache only when offline.
	// #148: /app (PWA start_url) cached too — its SSR HTML carries the
	// dehydrated feed state, so an offline cold start renders the cached
	// feed instead of a network error page.
	if (event.request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/app")) {
		event.respondWith(
			fetch(event.request)
				.then((response) => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
					}
					return response;
				})
				.catch(() => caches.match(event.request).then((cached) => cached ?? Response.error())),
		);
		return;
	}

	// Skip /app subresources — let TanStack Start handle them without service worker interference
	if (url.pathname.startsWith("/app")) return;

	// Static assets: cache-first w produkcji, network-first na localhost (dev).
	if (isStaticAsset(url.pathname)) {
		if (isLocalDev) {
			event.respondWith(
				fetch(event.request)
					.then((response) => {
						if (response.ok) {
							const clone = response.clone();
							caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
						}
						return response;
					})
					.catch(() => caches.match(event.request).then((cached) => cached ?? Response.error())),
			);
			return;
		}
		event.respondWith(
			caches.match(event.request).then((cached) => {
				if (cached) return cached;
				return fetch(event.request).then((response) => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
					}
					return response;
				});
			}),
		);
		return;
	}
});

function isStaticAsset(pathname) {
	return /\.(js|css|png|jpg|jpeg|svg|gif|ico|woff2?|ttf|eot|webp|avif)$/i.test(pathname);
}

self.addEventListener("push", (event) => {
	if (!event.data) return;

	let payload;
	try {
		payload = event.data.json();
	} catch {
		return;
	}

	const { title, body, icon, url } = payload;

	event.waitUntil(
		self.registration.showNotification(title, {
			body: body || "",
			icon: icon || "/logo192.png",
			data: { url: url || "/app" },
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();

	const url = event.notification.data?.url || "/app";

	event.waitUntil(
		clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
			for (const client of windowClients) {
				if (client.url.includes(url) && "focus" in client) {
					return client.focus();
				}
			}
			return clients.openWindow(url);
		}),
	);
});
