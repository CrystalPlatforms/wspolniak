// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	ingestSharedFiles,
	maybeIngestSharedFiles,
	type WspolniakBridgeLike,
} from "./android-bridge";
import { takePendingFiles } from "./waiting-room";

/**
 * Założenia spisane PRZED testami (F3, #222 — kontrakt mostka z powłoką Androida):
 * - mostek = window.WspolniakBridge: getPendingFiles() → JSON [{url,name,size,mime}],
 *   clearPendingFiles(); url wskazuje na asset-loader, bajty fetchujemy do File.
 * - consume-once: clearPendingFiles wołamy ZAWSZE po próbie pobrania — też przy
 *   błędzie fetcha i przy zepsutym JSON (stale pliki nie mogą przeżyć do kolejnego
 *   startu); "później" znaczy po odłożeniu do poczekalni.
 * - all-or-nothing: jeden nieudany plik = nic nie trafia do poczekalni (czysty
 *   kompozytor zamiast połówkowego załącznika).
 * - pusty mostek ([]) i brak mostka (zwykła przeglądarka/PWA) → no-op, false.
 * - Nie testujemy tu: strony Androida (HITL), serializacji JSON po stronie mostka.
 */

function makeBridge(metadata: string) {
	return {
		getPendingFiles: vi.fn(() => metadata),
		clearPendingFiles: vi.fn(),
	};
}

function makeFetch(body = "x", state: { failed?: boolean } = {}): typeof fetch {
	return vi.fn(async () => {
		if (state.failed) {
			throw new Error("sieć padła");
		}
		return { ok: true, blob: async () => new Blob([body]) } as unknown as Response;
	}) as unknown as typeof fetch;
}

describe("mostek Androida (share intake, #222)", () => {
	beforeEach(() => {
		takePendingFiles();
		// izolacja: żaden test nie dziedziczy mostka po poprzednim
		delete (globalThis as Record<string, unknown>).WspolniakBridge;
	});

	it("pobiera pliki przez mostek, wkłada File do poczekalni i czyści mostek", async () => {
		const bridge = makeBridge(
			JSON.stringify([
				{
					url: "https://appassets.androidplatform.net/pending/0",
					name: "wakacje.jpg",
					size: 1,
					mime: "image/jpeg",
				},
			]),
		);
		const clearSpy = bridge.clearPendingFiles;
		let clearedDuringFetch = false;
		const fetchImpl = vi.fn(async () => {
			clearedDuringFetch = clearedDuringFetch || clearSpy.mock.calls.length > 0;
			return { ok: true, blob: async () => new Blob(["x"]) } as unknown as Response;
		}) as unknown as typeof fetch;

		const result = await ingestSharedFiles(bridge, fetchImpl);

		expect(result).toBe(true);
		const files = takePendingFiles();
		expect(files).toHaveLength(1);
		expect(files[0]?.name).toBe("wakacje.jpg");
		expect(files[0]?.type).toBe("image/jpeg");
		// clear dopiero PO odłożeniu plików (consume-once w poprawnej kolejności)
		expect(clearedDuringFetch).toBe(false);
		expect(clearSpy).toHaveBeenCalledTimes(1);
	});

	it("drugi ingest po wyczyszczeniu mostka nie wkłada nic (brak stale plików)", async () => {
		let metadata = JSON.stringify([
			{
				url: "https://appassets.androidplatform.net/pending/0",
				name: "kotek.mp4",
				size: 1,
				mime: "video/mp4",
			},
		]);
		const bridge: WspolniakBridgeLike = {
			getPendingFiles: () => metadata,
			clearPendingFiles: () => {
				metadata = "[]";
			},
		};
		const fetchImpl = makeFetch();

		expect(await ingestSharedFiles(bridge, fetchImpl)).toBe(true);
		expect(takePendingFiles()).toHaveLength(1); // kompozytor zabiera przy montażu
		expect(await ingestSharedFiles(bridge, fetchImpl)).toBe(false);
		expect(takePendingFiles()).toEqual([]);
	});

	it("błąd pobierania czyści mostek i zostawia czystą poczekalnię", async () => {
		const bridge = makeBridge(
			JSON.stringify([
				{
					url: "https://appassets.androidplatform.net/pending/0",
					name: "duze.mp4",
					size: 9,
					mime: "video/mp4",
				},
			]),
		);
		const state = { failed: true };

		const result = await ingestSharedFiles(bridge, makeFetch("x", state));

		expect(result).toBe(false);
		expect(bridge.clearPendingFiles).toHaveBeenCalledTimes(1);
		expect(takePendingFiles()).toEqual([]);
	});

	it("zepsuty JSON czyści mostek i nie wkłada nic", async () => {
		const bridge = makeBridge("to nie jest json");

		const result = await ingestSharedFiles(bridge, makeFetch());

		expect(result).toBe(false);
		expect(bridge.clearPendingFiles).toHaveBeenCalledTimes(1);
		expect(takePendingFiles()).toEqual([]);
	});

	it("bez mostka (zwykła przeglądarka/PWA) jest no-op i zwraca false", async () => {
		const result = await maybeIngestSharedFiles();

		expect(result).toBe(false);
		expect(takePendingFiles()).toEqual([]);
	});
});
