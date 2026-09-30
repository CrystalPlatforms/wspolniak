// SPDX-License-Identifier: AGPL-3.0-or-later
import { compressImage } from "@/images/compress";

/**
 * Upload zdjęć do Cloudflare Images (issue #135): deep module łączący batch
 * upload-urls, kompresję i bezpośredni upload — z twardym timeoutem i jasnymi
 * błędami zamiast generycznego "Load failed" z przeglądarki.
 */

/** Twardy limit czasu szybkiego requestu JSON (batch upload-urls, create-post) w ms. */
export const UPLOAD_TIMEOUT_MS = 7000;

/** Postęp uploadu jednego zdjęcia — z realnych bajtów transferu (nie szacunku). */
export interface ImageUploadProgress {
	fileName: string;
	fileIndex: number;
	total: number;
	percent: number;
}

/**
 * Opcje `uploadImages` (issue #203): progres % z realnych bajtów, ostrzeżenie
 * „wolne łącze" z mierzonej przepustowości, telemetria etapów.
 */
export interface UploadImagesOptions {
	/** Progres uploadu POJEDYNCZEGO pliku z realnych bajtów (XHR upload.onprogress). */
	onProgress?: (p: ImageUploadProgress) => void;
	/**
	 * Ostrzeżenie „wolne łącze" — mierzona przepustowość < SLOW_LINK_THRESHOLD_BPS
	 * (100 KB/s) po min. SLOW_LINK_MIN_SAMPLE_MS (2 s) transferu; raz na plik.
	 */
	onSlowLink?: (fileName: string) => void;
	/**
	 * Telemetria etapów (compress / transfer) — domyślnie console.info.
	 * Iniekcja dla testów.
	 */
	onTelemetry?: (t: UploadStageTelemetry) => void;
}

/** Telemetria jednego etapu uploadu pliku — diagnostyka „gdzie ucieka czas". */
export interface UploadStageTelemetry {
	fileName: string;
	stage: "compress" | "transfer";
	durationMs: number;
	bytes: number;
}

/**
 * Ile plików leci naraz w serii (issue #203): 2 zamiast pełnego Promise.all.
 * Na wąskim paśmie LTE równoległość dzieli pasmo — każdy plik osobno wbijał
 * w twardy limit. 2 daje pipelining: kompresja N+1 w Web Workerze podczas
 * gdy N leci po sieci.
 */
export const IMAGE_UPLOAD_CONCURRENCY = 2;

/**
 * Próg „wolnego łącza" (B/s) z realnej przepustowości transferu (issue #203).
 * 100 KB/s = wolne LTE/dziwne Wi-Fi; szerokopasmowe ma rzędy wielkości więcej.
 */
export const SLOW_LINK_THRESHOLD_BPS = 100_000;

/**
 * Min. okno pomiaru (ms) zanim oceniamy przepustowość — wczesne progress eventy
 * (TCP slow start) zawyżają/zaniżają pomiar.
 */
export const SLOW_LINK_MIN_SAMPLE_MS = 2_000;

/** Kroki flow — trafiają do szczegółów błędu i raportu nieudanego uploadu. */
export type UploadStep = "upload-urls" | "compress" | "image-upload" | "create-post";

export type UploadErrorKind = "timeout" | "network" | "http" | "unknown";

/**
 * Błąd uploadu ze strukturą zrozumiałą dla UI (komunikat) i diagnostyki
 * (step/kind/detail/fileName). Zastępuje surowe `TypeError: Load failed` Safari.
 */
export class UploadFlowError extends Error {
	constructor(
		public readonly step: UploadStep,
		public readonly kind: UploadErrorKind,
		message: string,
		public readonly detail?: string,
		public readonly fileName?: string,
	) {
		super(message);
		this.name = "UploadFlowError";
	}
}

/** Tłumaczy surowy błąd fetch/compress na UploadFlowError z polskim komunikatem. */
function describeUploadError(
	error: unknown,
	step: UploadStep,
	fileName?: string,
	timeoutMs: number = UPLOAD_TIMEOUT_MS,
): UploadFlowError {
	const name = error instanceof Error ? error.name : "";
	const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

	// AbortSignal.timeout odrzuca z TimeoutError; użytkownik nie abortuje ręcznie
	if (name === "TimeoutError" || name === "AbortError") {
		return new UploadFlowError(
			step,
			"timeout",
			fileName
				? `Przesłanie zdjęcia „${fileName}" trwało zbyt długo (limit ${timeoutMs / 1000} s) — połączenie jest zbyt wolne. Spróbuj ponownie lub dodaj mniej zdjęć naraz.`
				: `Serwer nie odpowiedział w ciągu ${timeoutMs / 1000} s — połączenie jest zbyt wolne. Spróbuj ponownie.`,
			detail,
			fileName,
		);
	}

	// TypeError z fetch = awaria sieci (Safari pokazuje "Load failed")
	if (error instanceof TypeError) {
		return new UploadFlowError(
			step,
			"network",
			fileName
				? `Nie udało się przesłać zdjęcia „${fileName}" — sprawdź połączenie z internetem i spróbuj ponownie.`
				: "Nie udało się połączyć z serwerem — sprawdź połączenie z internetem i spróbuj ponownie.",
			detail,
			fileName,
		);
	}

	return new UploadFlowError(
		step,
		"unknown",
		"Wystąpił nieznany błąd podczas przesyłania.",
		detail,
		fileName,
	);
}

/**
 * fetch z twardym timeoutem i tłumaczeniem błędów sieci na UploadFlowError.
 * Używany przez uploadImages i createPost (krok `create-post`).
 * `timeoutMs` domyślnie UPLOAD_TIMEOUT_MS; upload pliku nadaje własny, większy limit.
 */
export async function uploadFetch(
	url: string,
	init: RequestInit,
	step: UploadStep,
	fileName?: string,
	timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<Response> {
	try {
		return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
	} catch (error) {
		throw describeUploadError(error, step, fileName, timeoutMs);
	}
}

/**
 * Upload POJEDYNCZEGO pliku przez XHR — BEZ twardego limitu czasu (issue #203:
 * limit 20 s przerywał transfer, który by się dokończył na wolnym łączu;
 * upload leci do skutku). XHR zamiast fetch, bo fetch nie wspiera upload
 * progress w Safari — `xhr.upload.onprogress` daje realne bajty. Zwraca status.
 */
function uploadFileXhr(
	url: string,
	form: FormData,
	onProgress?: (loaded: number, total: number) => void,
): Promise<number> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", url);
		if (onProgress) {
			xhr.upload.onprogress = (event) => onProgress(event.loaded, event.total);
		}
		// onerror = awaria sieci (odpowiednik "Load failed"); onload = przyszła
		// odpowiedź (nawet 4xx/5xx — status sprawdzamy w flow).
		xhr.onerror = () => reject(new TypeError("Network request failed"));
		xhr.onload = () => resolve(xhr.status);
		xhr.send(form);
	});
}

/**
 * Uploaduje pliki: jeden batch `POST /upload-urls`, kompresja i upload każdego
 * pliku (max IMAGE_UPLOAD_CONCURRENCY naraz — issue #203). Zwraca `cfImageId`
 * w kolejności plików. Błędy (sieć/http) przepływają jako `UploadFlowError`.
 * `options.onProgress` — progres % per plik z realnych bajtów (XHR).
 * `options.onSlowLink` — „wolne łącze" z mierzonej przepustowości (B/s).
 */
export async function uploadImages(
	files: File[],
	options?: UploadImagesOptions,
): Promise<string[]> {
	if (files.length === 0) return [];
	return uploadImagesInner(files, options);
}

async function uploadImagesInner(files: File[], options?: UploadImagesOptions): Promise<string[]> {
	const batchRes = await uploadFetch(
		"/api/app/images/upload-urls",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ count: files.length }),
		},
		"upload-urls",
	);
	if (!batchRes.ok) {
		throw new UploadFlowError(
			"upload-urls",
			"http",
			"Nie udało się uzyskać adresów do przesyłania zdjęć.",
			`HTTP ${batchRes.status}`,
		);
	}
	const { data: pairs } = (await batchRes.json()) as {
		data: { cfImageId: string; uploadURL: string }[];
	};

	return mapWithConcurrency(files, IMAGE_UPLOAD_CONCURRENCY, async (file, index) => {
		const pair = pairs[index];
		if (!pair) {
			throw new UploadFlowError(
				"upload-urls",
				"unknown",
				"Brak adresu uploadu dla pliku.",
				undefined,
				file.name,
			);
		}
		// Telemetria etapów (#203): mierzy compress i transfer — domyślnie
		// console.info, opcjonalnie iniekcja przez options.onTelemetry (testy).
		const emit = (stage: "compress" | "transfer", durationMs: number): void => {
			const entry: UploadStageTelemetry = {
				fileName: file.name,
				stage,
				durationMs,
				bytes: compressed.size,
			};
			if (options?.onTelemetry) options.onTelemetry(entry);
			// biome-ignore lint/suspicious/noConsole: telemetria uploadu widoczna w konsoli (diagnostyka #203)
			else console.info("[upload]", entry);
		};
		const compressStart = Date.now();
		let compressed: File;
		try {
			compressed = await compressImage(file);
		} catch (error) {
			throw describeUploadError(error, "compress", file.name);
		}
		emit("compress", Date.now() - compressStart);
		const form = new FormData();
		form.append("file", compressed);
		let transferStart: number | null = null;
		let slowLinkFired = false;
		const uploadStart = Date.now();
		const status = await uploadFileXhr(pair.uploadURL, form, (loaded, total) => {
			if (transferStart === null) {
				transferStart = Date.now();
			}
			if (total > 0) {
				options?.onProgress?.({
					fileName: file.name,
					fileIndex: index,
					total: files.length,
					percent: Math.min(100, Math.round((loaded / total) * 100)),
				});
			}
			// „Wolne łącze" z realnej przepustowości (B/s), nie czasu (issue #203):
			// po min. oknie pomiaru, jeśli < próg — ostrzeżenie RAZ na plik.
			const elapsed = Date.now() - transferStart;
			const bps = (loaded / Math.max(elapsed, 1)) * 1000;
			if (!slowLinkFired && elapsed >= SLOW_LINK_MIN_SAMPLE_MS && bps < SLOW_LINK_THRESHOLD_BPS) {
				slowLinkFired = true;
				options?.onSlowLink?.(file.name);
			}
		}).catch((error: unknown) => {
			throw describeUploadError(error, "image-upload", file.name);
		});
		emit("transfer", Date.now() - uploadStart);
		if (status >= 400) {
			throw new UploadFlowError(
				"image-upload",
				"http",
				`Nie udało się przesłać zdjęcia „${file.name}".`,
				`HTTP ${status}`,
				file.name,
			);
		}
		return pair.cfImageId;
	});
}

/**
 * Uruchamia `fn` dla kolejnych itemów z limitem równoległości `limit`
 * (worker-pool). Wyniki w kolejności wejścia. Błąd jednego itemu → odrzuca
 * całość (jak Promise.all — pierwszy błąd wygrywa).
 */
async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const index = next++;
			const item = items[index];
			if (item === undefined) continue;
			results[index] = await fn(item, index);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
	return results;
}
