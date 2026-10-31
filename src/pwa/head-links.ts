// SPDX-License-Identifier: AGPL-3.0-or-later

// Cache-busting ikon PWA (GH #228).
// iOS kluczuje ikonę ekranu głównego per URL i nie odświeża jej po usunięciu
// i ponownym dodaniu PWA — urządzenia, które zapisały monogram „W", widziały
// go mimo poprawnych plików na serwerze. Zmiana URL-a (query `?v=`) wymusza
// świeże pobranie ikony. Podbijaj ICON_CACHE_VERSION przy każdej zmianie
// plików ikon.
const ICON_CACHE_VERSION = 2;

export type PwaIconLink = {
	rel: "apple-touch-icon";
	sizes: string;
	href: string;
	media?: string;
};

// Kolejność ma znaczenie: iOS 18+ wybiera wariant z media query pasujący do
// aktualnego wyglądu systemu, starsze wersje iOS biorą ostatni link bez media.
export const pwaIconLinks: readonly PwaIconLink[] = [
	{
		rel: "apple-touch-icon",
		sizes: "180x180",
		href: `/apple-touch-icon-dark.png?v=${ICON_CACHE_VERSION}`,
		media: "(prefers-color-scheme: dark)",
	},
	{
		rel: "apple-touch-icon",
		sizes: "180x180",
		href: `/apple-touch-icon.png?v=${ICON_CACHE_VERSION}`,
	},
];
