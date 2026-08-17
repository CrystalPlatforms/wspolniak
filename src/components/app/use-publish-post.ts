// SPDX-License-Identifier: AGPL-3.0-or-later

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { feedQueryKey } from "@/components/app/feed-query";
import type { Mention } from "@/components/app/mention-input";
import { reportUploadFailure, UploadFlowError, uploadFetch, uploadImages } from "@/images/upload";

/** Wejście publikacji posta (tekst + pliki + wideo + wzmianki). */
export interface PublishPostInput {
	description: string | null;
	files: File[];
	videoIds: string[];
	mentions: Mention[];
}

/**
 * Czas wypełniania paska postępu (ms). MUSI zgadzać się z animacją `7s` klasy
 * `animate-[publish-indeterminate_7s_ease-out_forwards]` w `new-post-form.tsx`.
 * Pasek ma dojść do 100% zanim nawigujemy do feedu.
 */
export const PUBLISH_BAR_DURATION_MS = 7000;

export interface RunPublishFlowOptions {
	input: PublishPostInput;
	navigate: (opts: { to: string }) => Promise<void> | void;
	queryClient: QueryClient;
	/** Moment startu (Date.now(), ms) — do obliczenia ile brakuje do pełnego paska. */
	startedAt: number;
	/** Jedyna granica sieci — mockowana w testach, realna w hooku usePublishPost. */
	createPostFn?: (input: PublishPostInput) => Promise<unknown>;
}

/**
 * Pełny lifecycle publikacji (deep module, testowalny bez Reacta):
 * 1. `createPost` (upload zdjęć + create) — jedyna granica sieci.
 * 2. `refetchQueries` feedu — post musi być w cache, żeby po nawigacji był widoczny od razu.
 * 3. odczekanie do pełnego wypełnienia paska (`PUBLISH_BAR_DURATION_MS` od `startedAt`).
 * 4. `navigate` do `/app`.
 *
 * Błąd na którymokolwiek kroku → rzucany (formularz zostaje z tekstem/zdjęciami, error → Alert).
 */
export async function runPublishFlow(options: RunPublishFlowOptions): Promise<void> {
	const create = options.createPostFn ?? createPost;
	await create(options.input);
	await options.queryClient.refetchQueries({ queryKey: feedQueryKey });
	const remaining = PUBLISH_BAR_DURATION_MS - (Date.now() - options.startedAt);
	if (remaining > 0) {
		await new Promise((resolve) => setTimeout(resolve, remaining));
	}
	await options.navigate({ to: "/app" });
}

/**
 * Realna funkcja create (granica sieci): kompresuje + uploaduje zdjęcia i tworzy post.
 *
 * Zdjęcia idą przez `uploadImages` (issue #135: batch upload-urls, kompresja w workerze,
 * równoległy upload, twardy timeout 7 s i jasne błędy zamiast "Load failed").
 * `cfImageId` zachowują kolejność plików.
 */
export async function createPost(input: PublishPostInput): Promise<unknown> {
	const cfImageIds = input.files.length > 0 ? await uploadImages(input.files) : [];

	let res: Response;
	try {
		res = await uploadFetch(
			"/api/app/posts",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					description: input.description || null,
					cfImageIds,
					videoIds: input.videoIds,
					mentions: input.mentions,
				}),
			},
			"create-post",
		);
	} catch (error) {
		// Awaria sieci/timeout przy tworzeniu posta — serwer jej nie zna, więc
		// zgłaszamy do panelu admina (issue #135); http (np. 429) serwer zna sam.
		if (error instanceof UploadFlowError && error.kind !== "http") {
			reportUploadFailure({
				step: error.step,
				kind: error.kind,
				detail: error.detail,
			});
		}
		throw error;
	}

	if (res.status === 429) {
		throw new UploadFlowError(
			"create-post",
			"http",
			"Osiągnięto dzienny limit postów (50)",
			"HTTP 429",
		);
	}
	if (!res.ok) {
		// Serwer mówi konkretnie CZEMU odrzucił (np. "Validation failed" + pole) —
		// przepuszczamy jego przyczynę do komunikatu/szczegółów (issue #135).
		const body = (await res.json().catch(() => null)) as {
			error?: string;
			details?: { fieldErrors?: Record<string, string[]> };
		} | null;
		const fieldErrors = body?.details?.fieldErrors ?? {};
		const fieldsText = Object.entries(fieldErrors)
			.map(([field, errors]) => `${field}: ${(errors ?? []).join(", ")}`)
			.join("; ");
		const detail = [`HTTP ${res.status}`, body?.error, fieldsText].filter(Boolean).join(" — ");

		// Znane przypadki walidacji tłumaczymy na konkretny polski komunikat.
		let message = "Nie udało się utworzyć posta";
		if (fieldErrors.description?.some((e) => e.includes("2000"))) {
			message = `Tekst posta jest za długi — limit to 2000 znaków (wpisanych: ${input.description?.length ?? "?"})`;
		}

		throw new UploadFlowError("create-post", "http", message, detail);
	}

	return res.json();
}

export interface UsePublishPostResult {
	publish: (input: PublishPostInput) => Promise<void>;
	isPending: boolean;
	isError: boolean;
	error: Error | null;
	reset: () => void;
}

/**
 * Hook (deep module) właściciel publishowania. `isPending` zostaje true przez CAŁY flow
 * (create → refetch → odczekanie paska → navigate), więc pasek jest widoczny aż do pełna
 * i znika dopiero przy nawigacji. Przy błędzie `isPending=false`, `error` ustawione.
 */
export function usePublishPost(): UsePublishPostResult {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const publish = useCallback(
		async (input: PublishPostInput) => {
			setError(null);
			setIsPending(true);
			try {
				await runPublishFlow({
					input,
					navigate,
					queryClient,
					startedAt: Date.now(),
				});
				// sukces: navigate odpaliło się w runPublishFlow, komponent się odmontuje.
				// Celowo nie zerujemy isPending — pasek ma być pełny aż do samej nawigacji.
			} catch (e) {
				setError(e instanceof Error ? e : new Error(String(e)));
				setIsPending(false);
			}
		},
		[navigate, queryClient],
	);

	return {
		publish,
		isPending,
		isError: error !== null,
		error,
		reset: () => {
			setError(null);
			setIsPending(false);
		},
	};
}
