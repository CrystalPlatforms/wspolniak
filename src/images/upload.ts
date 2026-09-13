// SPDX-License-Identifier: AGPL-3.0-or-later
import { compressImage } from "@/images/compress";

/**
 * Upload zdjęć do Cloudflare Images (issue #135): deep module łączący batch
 * upload-urls, kompresję i bezpośredni upload — z twardym timeoutem i jasnymi
 * błędami zamiast generycznego "Load failed" z przeglądarki.
 */

/** Twardy limit czasu szybkiego requestu JSON (batch upload-urls, create-post) w ms. */
export const UPLOAD_TIMEOUT_MS = 7000;

/**
 * Twardy limit czasu uploadu POJEDYNCZEGO pliku (ms) — większy od UPLOAD_TIMEOUT_MS,
 * bo duże zdjęcie na wolnym łączu potrzebuje więcej czasu (issue #199).
 */
export const FILE_UPLOAD_TIMEOUT_MS = 20_000;

/**
 * Próg (ms) po którym upload PLIKU woła `onSlowUpload` — ostrzeżenie „wolne łącze"
 * bez przerywania uploadu (issue #199). Zgadza się z UPLOAD_TIMEOUT_MS, żeby
 * ostrzeżenie pojawiało się dokładnie tam, gdzie wcześniej leciał twardy błąd.
 */
export const SLOW_UPLOAD_WARNING_MS = 7000;

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
 * Upload POJEDYNCZEGO pliku z twardym limitem FILE_UPLOAD_TIMEOUT_MS (20 s).
 * Po SLOW_UPLOAD_WARNING_MS (7 s) woła `onSlowUpload` (ostrzeżenie „wolne łącze"),
 * ale NIE przerywa uploadu — timer to czysty side-effect obok fetcha (issue #199).
 */
async function uploadFileWithSlowWarning(
	url: string,
	init: RequestInit,
	fileName: string,
	onSlowUpload?: (fileName: string) => void,
): Promise<Response> {
	let slowTimer: ReturnType<typeof setTimeout> | undefined;
	if (onSlowUpload) {
		slowTimer = setTimeout(() => onSlowUpload(fileName), SLOW_UPLOAD_WARNING_MS);
	}
	try {
		return await uploadFetch(url, init, "image-upload", fileName, FILE_UPLOAD_TIMEOUT_MS);
	} finally {
		clearTimeout(slowTimer);
	}
}

/**
 * Uploaduje pliki: jeden batch `POST /upload-urls`, kompresja i upload każdego
 * pliku równolegle (issue #95). Zwraca `cfImageId` w kolejności plików.
 * Błędy (sieć/timeout/http) przepływają jako szczegółowy `UploadFlowError`.
 * `onSlowUpload` (opcjonalny) — wołany gdy upload PLIKU trwa dłużej niż
 * SLOW_UPLOAD_WARNING_MS (7 s); NIE przerywa uploadu (issue #199).
 */
export async function uploadImages(
	files: File[],
	onSlowUpload?: (fileName: string) => void,
): Promise<string[]> {
	if (files.length === 0) return [];
	return uploadImagesInner(files, onSlowUpload);
}

async function uploadImagesInner(
	files: File[],
	onSlowUpload?: (fileName: string) => void,
): Promise<string[]> {
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

	return Promise.all(
		files.map(async (file, index) => {
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
			let compressed: File;
			try {
				compressed = await compressImage(file);
			} catch (error) {
				throw describeUploadError(error, "compress", file.name);
			}
			const form = new FormData();
			form.append("file", compressed);
			const uploadRes = await uploadFileWithSlowWarning(
				pair.uploadURL,
				{ method: "POST", body: form },
				file.name,
				onSlowUpload,
			);
			if (!uploadRes.ok) {
				throw new UploadFlowError(
					"image-upload",
					"http",
					`Nie udało się przesłać zdjęcia „${file.name}".`,
					`HTTP ${uploadRes.status}`,
					file.name,
				);
			}
			return pair.cfImageId;
		}),
	);
}
