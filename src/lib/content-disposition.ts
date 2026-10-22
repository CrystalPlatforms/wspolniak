// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Content-Disposition z polskimi znakami w nazwie: fallback ASCII (znaki
 * spoza 20–7E i cudzysłowy → „_") + RFC 5987 filename* (UTF-8). Wspólne dla
 * albumów (ZIP) i pojedynczych zdjęć (#225).
 */
export function contentDispositionAttachment(filename: string): string {
	const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
