// SPDX-License-Identifier: AGPL-3.0-or-later
interface DirectUploadConfig {
	accountId: string;
	apiToken: string;
}

interface DirectUploadResult {
	cfImageId: string;
	uploadURL: string;
}

export async function createDirectUploadUrl(
	config: DirectUploadConfig,
): Promise<DirectUploadResult> {
	const { accountId, apiToken } = config;

	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v2/direct_upload`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiToken}`,
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Cloudflare Images API error: ${response.status}`);
	}

	const data = (await response.json()) as {
		result: { id: string; uploadURL: string };
	};

	return {
		cfImageId: data.result.id,
		uploadURL: data.result.uploadURL,
	};
}

/**
 * Pobiera `count` par `{cfImageId, uploadURL}` w jednym wywołaniu (równolegle).
 * Zastępuje N sekwencyjnych round-tripów przy publikacji batcha zdjęć (issue #95).
 * `count <= 0` → `[]` (nie woła CF API). Błąd dowolnej pary → odrzuca całość.
 */
export async function createDirectUploadUrlBatch(
	config: DirectUploadConfig,
	count: number,
): Promise<DirectUploadResult[]> {
	if (count <= 0) return [];
	return Promise.all(Array.from({ length: count }, () => createDirectUploadUrl(config)));
}

/**
 * Usuwa jedno zdjęcie z Cloudflare Images (#173 — czyszczenie zdjęć własnych
 * przy usuwaniu albumu). 404 traktujemy jak sukces (obraz już nie istnieje,
 * np. po retry) — zgodnie ze wzorcem usuwania wideo z YouTube.
 */
export async function deleteCfImage(config: DirectUploadConfig, cfImageId: string): Promise<void> {
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/images/v1/${cfImageId}`,
		{
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${config.apiToken}`,
			},
		},
	);

	if (!response.ok && response.status !== 404) {
		throw new Error(`Cloudflare Images API error: ${response.status}`);
	}
}

/**
 * Usuwa wiele zdjęć równolegle (#173). Pusta lista → bez wywołania API
 * (mirror createDirectUploadUrlBatch).
 */
export async function deleteCfImages(
	config: DirectUploadConfig,
	cfImageIds: string[],
): Promise<void> {
	if (cfImageIds.length === 0) return;
	await Promise.all(cfImageIds.map((cfImageId) => deleteCfImage(config, cfImageId)));
}

interface ImageUrlConfig {
	accountHash: string;
	cfImageId: string;
	variant?: string;
}

export function getImageUrl(config: ImageUrlConfig): string {
	const { accountHash, cfImageId, variant = "public" } = config;

	if (cfImageId.startsWith("placeholder-")) {
		const seed = cfImageId.replace("placeholder-", "");
		const size = variant === "thumbnail" ? "400/400" : "1200/800";
		return `https://picsum.photos/seed/${seed}/${size}`;
	}

	return `https://imagedelivery.net/${accountHash}/${cfImageId}/${variant}`;
}
