// SPDX-License-Identifier: AGPL-3.0-or-later
import { findAndroidBridge } from "./android-bridge";

function isMobileDevice(): boolean {
	return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Czy strona działa w powłoce Androida (mostek z F3, #222). */
export function isAndroidWrapper(): boolean {
	return findAndroidBridge() !== null;
}

/**
 * Pobieranie w powłoce (#225): nawigacja top-level na trasę attachment — WebView
 * oddaje ją do DownloadListener (DownloadManager), a przeglądarka dostaje plik
 * dzięki Content-Disposition. Renderowana strona (lightbox) przeżywa: odpowiedź
 * attachment nie podmienia dokumentu.
 */
export function downloadImageNative(cfImageId: string, filename: string): void {
	window.location.assign(
		`/api/app/images/${encodeURIComponent(cfImageId)}/download?name=${encodeURIComponent(filename)}`,
	);
}

export async function downloadImage(
	url: string,
	filename: string,
	onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			window.open(url, "_blank");
			return;
		}

		const contentLength = Number(response.headers.get("content-length") || 0);
		const total = contentLength > 0 ? contentLength : 0;

		if (!response.body || !total) {
			const blob = await response.blob();
			triggerDownload(blob, url, filename);
			return;
		}

		const reader = response.body.getReader();
		const chunks: Uint8Array[] = [];
		let loaded = 0;

		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			loaded += value.length;
			onProgress?.(loaded, total);
		}

		const blob = new Blob(chunks as BlobPart[], {
			type: response.headers.get("content-type") || "image/jpeg",
		});

		if (isMobileDevice()) {
			const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
			if (navigator.share && navigator.canShare?.({ files: [file] })) {
				try {
					await navigator.share({ files: [file] });
					return;
				} catch {
					// User cancelled share sheet — fall through to download
				}
			}
		}

		triggerDownload(blob, url, filename);
	} catch {
		window.open(url, "_blank");
	}
}

function triggerDownload(blob: Blob, fallbackUrl: string, filename: string) {
	const blobUrl = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = blobUrl;
	link.download = filename;
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(blobUrl);
	void fallbackUrl;
}
