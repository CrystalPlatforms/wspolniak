// SPDX-License-Identifier: AGPL-3.0-or-later
import { putPendingFiles } from "./waiting-room";

/**
 * Mostek z powłoką Androida (F3, #222): powłoka udostępnia `window.WspolniakBridge`
 * (addJavascriptInterface) z plikami otrzymanymi przez ACTION_SEND. Metadane idą
 * przez mostek jako JSON, bajty — przez asset-loader URL (`WebViewAssetLoader`),
 * więc duże wideo nigdy nie przechodzi przez mostek jako base64. Ten moduł zamienia
 * ofertę mostka na `File` i wkłada do poczekalni (`waiting-room`), skąd kompozytor
 * `/app/new` zabiera je przy montażu. Zwykła przeglądarka/PWA: mostka nie ma → no-op.
 */

/** Metadane jednego udostępnionego pliku — kontrakt z {@link WspolniakBridge}. */
export interface PendingBridgeFile {
	url: string;
	name: string;
	size: number;
	mime: string;
}

/** Kształt `window.WspolniakBridge` widziany ze strony. */
export interface WspolniakBridgeLike {
	getPendingFiles(): string;
	clearPendingFiles(): void;
}

function isBridge(candidate: unknown): candidate is WspolniakBridgeLike {
	return (
		typeof candidate === "object" &&
		candidate !== null &&
		typeof (candidate as WspolniakBridgeLike).getPendingFiles === "function" &&
		typeof (candidate as WspolniakBridgeLike).clearPendingFiles === "function"
	);
}

/** Szuka mostka w globalnym zakresie; null poza powłoką Androida. */
export function findAndroidBridge(): WspolniakBridgeLike | null {
	const candidate = (globalThis as Record<string, unknown>).WspolniakBridge;
	return isBridge(candidate) ? candidate : null;
}

/**
 * Odbiera udostępnione pliki: metadane z mostka → fetch bajtów → `File` do poczekalni.
 * Consume-once: `clearPendingFiles()` wołane zawsze po próbie — także przy błędzie
 * pobierania czy zepsutym JSON, żeby stale pliki nie przeżyły do kolejnego startu.
 * All-or-nothing: jeden nieudany plik = nic nie trafia do poczekalni.
 * @returns true, gdy pliki wylądowały w poczekalni.
 */
export async function ingestSharedFiles(
	bridge: WspolniakBridgeLike,
	fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
	let metadata: PendingBridgeFile[];
	try {
		const parsed: unknown = JSON.parse(bridge.getPendingFiles());
		metadata = Array.isArray(parsed) ? (parsed as PendingBridgeFile[]) : [];
	} catch {
		metadata = [];
	}
	if (metadata.length === 0) {
		bridge.clearPendingFiles();
		return false;
	}
	const files: File[] = [];
	for (const meta of metadata) {
		try {
			const response = await fetchImpl(meta.url);
			if (!response.ok) {
				throw new Error(`asset-loader HTTP ${response.status}`);
			}
			const blob = await response.blob();
			files.push(new File([blob], meta.name, { type: meta.mime }));
		} catch {
			bridge.clearPendingFiles();
			return false;
		}
	}
	putPendingFiles(files);
	bridge.clearPendingFiles();
	return true;
}

/** Glue dla loadera `/app/new`: bez mostka (zwykła przeglądarka) nie robi nic. */
export async function maybeIngestSharedFiles(): Promise<boolean> {
	const bridge = findAndroidBridge();
	if (!bridge) {
		return false;
	}
	try {
		return await ingestSharedFiles(bridge);
	} catch {
		return false;
	}
}
