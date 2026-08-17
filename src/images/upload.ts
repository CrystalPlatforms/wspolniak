// SPDX-License-Identifier: AGPL-3.0-or-later
import { compressImage } from "@/images/compress";

/**
 * Upload zdjęć do Cloudflare Images (issue #135): deep module łączący batch
 * upload-urls, kompresję i bezpośredni upload — z twardym timeoutem i jasnymi
 * błędami zamiast generycznego "Load failed" z przeglądarki.
 */

/** Twardy limit czasu pojedynczego requestu uploadu (ms). */
export const UPLOAD_TIMEOUT_MS = 7000;

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
function describeUploadError(error: unknown, step: UploadStep, fileName?: string): UploadFlowError {
	const name = error instanceof Error ? error.name : "";
	const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

	// AbortSignal.timeout odrzuca z TimeoutError; użytkownik nie abortuje ręcznie
	if (name === "TimeoutError" || name === "AbortError") {
		return new UploadFlowError(
			step,
			"timeout",
			fileName
				? `Przesłanie zdjęcia „${fileName}" trwało zbyt długo (limit ${UPLOAD_TIMEOUT_MS / 1000} s) — połączenie jest zbyt wolne. Spróbuj ponownie lub dodaj mniej zdjęć naraz.`
				: `Serwer nie odpowiedział w ciągu ${UPLOAD_TIMEOUT_MS / 1000} s — połączenie jest zbyt wolne. Spróbuj ponownie.`,
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
 */
export async function uploadFetch(
	url: string,
	init: RequestInit,
	step: UploadStep,
	fileName?: string,
): Promise<Response> {
	try {
		return await fetch(url, { ...init, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
	} catch (error) {
		throw describeUploadError(error, step, fileName);
	}
}

/**
 * Best-effort raport nieudanego uploadu do panelu admina (issue #135).
 * Fire-and-forget: nigdy nie rzuca, nie blokuje UI — to tylko diagnostyka.
 */
export function reportUploadFailure(report: {
	step: UploadStep;
	kind: UploadErrorKind;
	detail?: string;
	fileName?: string;
	fileSize?: number;
}): void {
	try {
		void fetch("/api/app/upload-failures", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(report),
			// keepalive: raport przeżyje nawigację/zamknięcie karty po błędzie
			keepalive: true,
		}).catch(() => {
			// sieć leży — nic nie poradzimy, diagnostyka jest opcjonalna
		});
	} catch {
		// nawet synchroniczny błąd fetch nie może zepsuć flow uploadu
	}
}

/** Zgłasza błąd uploadu (poza http — te serwer już zna) i przepuszcza go dalej. */
function reportAndRethrow(error: unknown, files: File[]): never {
	if (error instanceof UploadFlowError && error.kind !== "http") {
		const fileSize = error.fileName
			? files.find((f) => f.name === error.fileName)?.size
			: undefined;
		reportUploadFailure({
			step: error.step,
			kind: error.kind,
			detail: error.detail,
			fileName: error.fileName,
			fileSize,
		});
	}
	throw error;
}

/**
 * Uploaduje pliki: jeden batch `POST /upload-urls`, kompresja i upload każdego
 * pliku równolegle (issue #95). Zwraca `cfImageId` w kolejności plików.
 * Awaria sieci/timeoutu → raport do admina (issue #135).
 */
export async function uploadImages(files: File[]): Promise<string[]> {
	if (files.length === 0) return [];

	try {
		return await uploadImagesInner(files);
	} catch (error) {
		reportAndRethrow(error, files);
	}
}

async function uploadImagesInner(files: File[]): Promise<string[]> {
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
			const uploadRes = await uploadFetch(
				pair.uploadURL,
				{ method: "POST", body: form },
				"image-upload",
				file.name,
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
