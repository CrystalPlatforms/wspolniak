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
 * Pobieranie w powłoce (#225, iteracja 4): bajty przekazane mostkiem do zapisu
 * (MediaStore Downloads po stronie shellu). ZERO nawigacji — dokument zostaje,
 * więc lightbox nie znika. Nawigacja na trasę attachment okazała się złym
 * pomysłem: pełne przeładowanie dokumentu zabija stan SPA.
 * @returns true, gdy powłoka potwierdziła zapis.
 */
export async function saveBlobViaBridge(blob: Blob, filename: string): Promise<boolean> {
	const bridge = findAndroidBridge();
	if (!bridge?.saveFile) {
		// DIAGNOSTYKA #225 (tymczasowa): widoczny sygnał warstwy, która zawiodła
		alert("Diag 1: brak mostka/saveFile w WebView");
		return false;
	}
	let base64: string;
	try {
		base64 = await blobToBase64(blob);
	} catch {
		alert("Diag 2: czytanie bloba (FileReader) nie powiodło się");
		return false;
	}
	const ok = bridge.saveFile(filename, blob.type || "application/octet-stream", base64);
	alert(
		ok
			? "Zapisano do galerii, jeśli nie ma — powinno być w Pobranych"
			: "Diag 3: powłoka odrzuciła zapis (saveFile=false)",
	);
	return ok;
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = String(reader.result ?? "");
			const comma = result.indexOf(",");
			resolve(comma >= 0 ? result.slice(comma + 1) : result);
		};
		reader.onerror = () => reject(new Error("FileReader nie przeczytał bloba"));
		reader.readAsDataURL(blob);
	});
}

export async function downloadImage(
	url: string,
	filename: string,
	onProgress?: (loaded: number, total: number) => void,
	saveOverride?: (blob: Blob, filename: string) => Promise<boolean> | boolean,
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
			await finishDownload(blob, url, filename, saveOverride);
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

		if (await tryShareOnMobile(blob, filename)) {
			return;
		}

		await finishDownload(blob, url, filename, saveOverride);
	} catch {
		window.open(url, "_blank");
	}
}

/** Mobilne przeglądarki: systemowy arkusz udostępniania z plikiem (#37). */
async function tryShareOnMobile(blob: Blob, filename: string): Promise<boolean> {
	if (!isMobileDevice()) {
		return false;
	}
	const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
	if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
		return false;
	}
	try {
		await navigator.share({ files: [file] });
		return true;
	} catch {
		return false; // user zamknął arkusz — spadamy do zwykłego zapisu
	}
}

/** saveOverride (powłoka: mostek → MediaStore) wygrywa; bez niego/porażka → kotwica. */
async function finishDownload(
	blob: Blob,
	fallbackUrl: string,
	filename: string,
	saveOverride?: (blob: Blob, filename: string) => Promise<boolean> | boolean,
): Promise<void> {
	if (saveOverride && (await saveOverride(blob, filename))) {
		return;
	}
	triggerDownload(blob, fallbackUrl, filename);
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
