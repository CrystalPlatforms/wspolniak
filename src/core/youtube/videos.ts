// SPDX-License-Identifier: AGPL-3.0-or-later
// YouTube video deletion (F4). Pure over an injected config + fetcher:
// tests mock only Google's API (system boundary), never our own modules.

import { type YoutubeConfig, youtubeError } from "./oauth";

const VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";

/**
 * Usuwa wideo z YouTube (DELETE videos?id=). Idempotentna: 204 (usunięto)
 * oraz 404 (wideo już nie istnieło, np. usunięte ręcznie na YouTube)
 * traktowane są jako sukces. Pozostałe błędy → `youtubeError`.
 */
export async function deleteVideo(
	videoId: string,
	accessToken: string,
	_config: YoutubeConfig,
	fetchFn: typeof fetch = fetch,
): Promise<void> {
	const params = new URLSearchParams({ id: videoId });
	const res = await fetchFn(`${VIDEOS_ENDPOINT}?${params}`, {
		method: "DELETE",
		headers: { authorization: `Bearer ${accessToken}` },
	});
	// 204 = usunięto; 404 = już nie istnieje (idempotentne czyszczenie rekordu Neon).
	if (res.status === 404) return;
	if (!res.ok) throw youtubeError(res, "usuwania wideo");
}
