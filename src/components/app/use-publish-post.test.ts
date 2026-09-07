// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient } from "@tanstack/react-query";
import { feedQueryKey } from "@/components/app/feed-query";
import { compressImage } from "@/images/compress";
import { UploadFlowError } from "@/images/upload";
import {
	createPost,
	PUBLISH_BAR_DURATION_MS,
	type PublishPostInput,
	runPublishFlow,
	VideoNotConnectedError,
} from "./use-publish-post";

vi.mock("@/images/compress", () => ({
	compressImage: vi.fn(),
}));

function makeQueryClient() {
	return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeInput(overrides: Partial<PublishPostInput> = {}): PublishPostInput {
	return {
		description: "Cześć",
		files: [],
		pendingVideos: [],
		mentions: [],
		...overrides,
	};
}

afterEach(() => {
	vi.useRealTimers();
});

describe("runPublishFlow", () => {
	it("szybki publish: create → refetch → odczekanie do pełnego paska (7s) → navigate", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);

		const qc = makeQueryClient();
		const refetchSpy = vi.spyOn(qc, "refetchQueries").mockResolvedValue(undefined);
		const navigate = vi.fn().mockResolvedValue(undefined);
		const createPostFn = vi.fn().mockResolvedValue(undefined);

		const flow = runPublishFlow({
			input: makeInput(),
			navigate,
			queryClient: qc,
			createPostFn,
			startedAt: 0,
		});

		// create + refetch resolve natychmiast (mocki); flow czeka na setTimeout(7000).
		await vi.advanceTimersByTimeAsync(PUBLISH_BAR_DURATION_MS - 1);
		expect(navigate).not.toHaveBeenCalled(); // pasek jeszcze niepełny — nie nawigujemy

		await vi.advanceTimersByTimeAsync(1);
		await flow;

		expect(refetchSpy).toHaveBeenCalledWith({ queryKey: feedQueryKey });
		expect(refetchSpy).toHaveBeenCalledBefore(navigate);
		// Brak wideo → navigate bez flagi videoPublished.
		expect(navigate).toHaveBeenCalledWith({ to: "/app" });
	});

	it("powolny publish (>czasu paska): nie czeka dodatkowo, navigate od razu (pasek już pełny)", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(PUBLISH_BAR_DURATION_MS + 1000); // "teraz" = 8s

		const qc = makeQueryClient();
		vi.spyOn(qc, "refetchQueries").mockResolvedValue(undefined);
		const navigate = vi.fn().mockResolvedValue(undefined);

		await runPublishFlow({
			input: makeInput(),
			navigate,
			queryClient: qc,
			createPostFn: vi.fn().mockResolvedValue(undefined),
			startedAt: 0, // start przy 0, "publish" trwał 8s → pasek pełny od 7s
		});

		expect(navigate).toHaveBeenCalledWith({ to: "/app" }); // bez dodatkowego setTimeout
	});

	it("gdy createPost odrzuca: rzuca, refetch i navigate nie wołane", async () => {
		const qc = makeQueryClient();
		const refetchSpy = vi.spyOn(qc, "refetchQueries").mockResolvedValue(undefined);
		const navigate = vi.fn();
		const createPostFn = vi.fn().mockRejectedValue(new Error("upload nie powiódł się"));

		await expect(
			runPublishFlow({
				input: makeInput(),
				navigate,
				queryClient: qc,
				createPostFn,
				startedAt: 0,
			}),
		).rejects.toThrow("upload nie powiódł się");

		expect(refetchSpy).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it("post z wideo: uploady (session→chunks→confirm) idą przed createPost, wpis videos osadzony w payloadzie", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);

		const qc = makeQueryClient();
		vi.spyOn(qc, "refetchQueries").mockResolvedValue(undefined);
		const navigate = vi.fn().mockResolvedValue(undefined);
		const createPostFn = vi.fn().mockResolvedValue(undefined);

		const file = new File([new Uint8Array(10)], "clip.mp4", { type: "video/mp4" });
		const flow = runPublishFlow({
			input: makeInput({
				pendingVideos: [{ file, title: "Klip" }],
			}),
			navigate,
			queryClient: qc,
			createPostFn,
			startedAt: 0,
			uploadVideoFn: vi.fn(async (_input, _onProgress, _deps) => ({
				youtubeVideoId: "yt-abc",
				thumbnailUrl: "https://i.ytimg.com/vi/yt-abc/default.jpg",
			})),
		});
		// flow czeka na pełny pasek (setTimeout 7s) — przyspieszamy zegar i domykamy.
		await vi.advanceTimersByTimeAsync(PUBLISH_BAR_DURATION_MS);
		await flow;

		// createPost dostał wpis videos osadzony w payloadzie (kolejność = kolejność pending).
		expect(createPostFn).toHaveBeenCalledWith(
			expect.objectContaining({
				videos: [
					{
						youtubeVideoId: "yt-abc",
						title: "Klip",
						thumbnailUrl: "https://i.ytimg.com/vi/yt-abc/default.jpg",
					},
				],
			}),
		);
		// Post z wideo → navigate z flagą videoPublished (toast na feedzie).
		expect(navigate).toHaveBeenCalledWith({
			to: "/app",
			search: { videoPublished: true },
		});
	});

	it("wiele wideo: uploady idą sekwencyjnie z per-wideo postępem („Wideo 1/2 — x%”)", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);

		const qc = makeQueryClient();
		vi.spyOn(qc, "refetchQueries").mockResolvedValue(undefined);
		const navigate = vi.fn().mockResolvedValue(undefined);

		const progressEvents: { videoIndex: number; total: number; percent: number }[] = [];
		const fileA = new File([new Uint8Array(5)], "a.mp4", { type: "video/mp4" });
		const fileB = new File([new Uint8Array(5)], "b.mp4", { type: "video/mp4" });

		// Kolejność resolve śledzi, że upload B startuje DOPIERO po resolve A (sekwencyjnie).
		const calls: string[] = [];
		const uploadVideoFn = vi.fn(
			async (
				input: { title: string },
				onProgress: (p: { uploadedBytes: number; totalBytes: number }) => void,
			) => {
				calls.push(`start:${input.title}`);
				await Promise.resolve();
				onProgress({ uploadedBytes: 5, totalBytes: 5 }); // 100%
				calls.push(`end:${input.title}`);
				return {
					youtubeVideoId: `yt-${input.title}`,
					thumbnailUrl: `https://i.ytimg.com/vi/yt-${input.title}/default.jpg`,
				};
			},
		);

		const flow = runPublishFlow({
			input: makeInput({
				pendingVideos: [
					{ file: fileA, title: "A" },
					{ file: fileB, title: "B" },
				],
			}),
			navigate,
			queryClient: qc,
			createPostFn: vi.fn().mockResolvedValue(undefined),
			startedAt: 0,
			onUploadProgress: (p) => progressEvents.push(p),
			uploadVideoFn: uploadVideoFn as never,
		});
		await vi.advanceTimersByTimeAsync(PUBLISH_BAR_DURATION_MS);
		await flow;

		expect(calls).toEqual(["start:A", "end:A", "start:B", "end:B"]);
		// Per-wideo postęp: ostatnie zdarzenie per wideo = 100%.
		const lastA = progressEvents.filter((p) => p.videoIndex === 0).at(-1);
		const lastB = progressEvents.filter((p) => p.videoIndex === 1).at(-1);
		expect(lastA).toEqual({ videoIndex: 0, total: 2, percent: 100 });
		expect(lastB).toEqual({ videoIndex: 1, total: 2, percent: 100 });
	});

	it("błąd uploadu wideo: rzuca (formularz zostaje z tekstem i listą wideo), post nie powstaje", async () => {
		const qc = makeQueryClient();
		const refetchSpy = vi.spyOn(qc, "refetchQueries").mockResolvedValue(undefined);
		const navigate = vi.fn().mockResolvedValue(undefined);
		const createPostFn = vi.fn().mockResolvedValue(undefined);

		const file = new File([new Uint8Array(10)], "clip.mp4", { type: "video/mp4" });

		await expect(
			runPublishFlow({
				input: makeInput({ pendingVideos: [{ file, title: "Klip" }] }),
				navigate,
				queryClient: qc,
				createPostFn,
				startedAt: 0,
				uploadVideoFn: vi.fn(async () => {
					throw new Error("Błąd uploadu (500)");
				}),
			}),
		).rejects.toThrow("Błąd uploadu (500)");

		// Post NIE powstaje po nieudanym uploadzie (kompozytor zostaje nietknięty).
		expect(createPostFn).not.toHaveBeenCalled();
		expect(refetchSpy).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it("503 z upload-session (YouTube niepołączony) → VideoNotConnectedError", async () => {
		const qc = makeQueryClient();
		vi.spyOn(qc, "refetchQueries").mockResolvedValue(undefined);
		const navigate = vi.fn().mockResolvedValue(undefined);

		const file = new File([new Uint8Array(10)], "clip.mp4", { type: "video/mp4" });

		await expect(
			runPublishFlow({
				input: makeInput({ pendingVideos: [{ file, title: "Klip" }] }),
				navigate,
				queryClient: qc,
				createPostFn: vi.fn(),
				startedAt: 0,
				uploadVideoFn: vi.fn(async () => {
					throw new VideoUploadHttpError("Najpierw połącz kanał YouTube", 503);
				}),
			}),
		).rejects.toBeInstanceOf(VideoNotConnectedError);
	});
});

// Potrzebny w teście 503 — import PO vi.mockach (klasa z use-video-upload).
import { VideoUploadHttpError } from "@/components/video/use-video-upload";

describe("createPost", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	function stubFetch(pairsFor: (count: number) => { cfImageId: string; uploadURL: string }[]) {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.endsWith("/api/app/images/upload-urls")) {
				const body = JSON.parse(String(init?.body)) as { count: number };
				return { ok: true, status: 200, json: async () => ({ data: pairsFor(body.count) }) };
			}
			if (url.startsWith("https://upload/")) {
				return { ok: true, status: 200, json: async () => ({}) };
			}
			if (url.endsWith("/api/app/posts")) {
				return { ok: true, status: 200, json: async () => ({ id: "post-1" }) };
			}
			throw new Error(`unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);
		return fetchMock;
	}

	it("wydaje DOKŁADNIE JEDEN batch upload-URL request dla N plików (bez single /upload-url)", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		const fetchMock = stubFetch((count) =>
			Array.from({ length: count }, (_, i) => ({
				cfImageId: `cf-${i + 1}`,
				uploadURL: `https://upload/cf-${i + 1}`,
			})),
		);

		const files = [
			new File(["a"], "1.jpg", { type: "image/jpeg" }),
			new File(["b"], "2.jpg", { type: "image/jpeg" }),
		];

		await createPost({ description: "hi", files, pendingVideos: [], mentions: [] });

		const calls = fetchMock.mock.calls.map(([u]) => String(u));

		// single endpoint nigdy niewołany
		expect(calls.filter((u) => u.endsWith("/api/app/images/upload-url"))).toHaveLength(0);
		// dokładnie jeden batch
		const batchCalls = fetchMock.mock.calls.filter(([u]) =>
			String(u).endsWith("/api/app/images/upload-urls"),
		);
		expect(batchCalls).toHaveLength(1);
		expect(JSON.parse(String(batchCalls[0]?.[1]?.body))).toEqual({ count: 2 });

		// N uploadów do CF
		expect(calls.filter((u) => u.startsWith("https://upload/"))).toHaveLength(2);

		// POST /posts z cfImageId w kolejności plików
		const postsCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/api/app/posts"));
		expect(postsCalls).toHaveLength(1);
		const postsBody = JSON.parse(String(postsCalls[0]?.[1]?.body)) as { cfImageIds: string[] };
		expect(postsBody.cfImageIds).toEqual(["cf-1", "cf-2"]);
	});

	it("pomija upload-urls całkowicie, gdy nie ma plików (samo POST /posts)", async () => {
		const fetchMock = stubFetch(() => []);

		await createPost({ description: "brak zdjęć", files: [], pendingVideos: [], mentions: [] });

		const calls = fetchMock.mock.calls.map(([u]) => String(u));
		expect(calls.filter((u) => u.endsWith("/api/app/images/upload-urls"))).toHaveLength(0);
		expect(calls.filter((u) => u.endsWith("/api/app/posts"))).toHaveLength(1);
	});

	it("POST /posts z wideo: videos osadzone w ciele żądania (#194)", async () => {
		const fetchMock = stubFetch(() => []);

		await createPost({
			description: "z wideo",
			files: [],
			pendingVideos: [],
			mentions: [],
			videos: [{ youtubeVideoId: "yt-1", title: "Klip", thumbnailUrl: "https://t/1" }],
		});

		const postsCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/api/app/posts"));
		const postsBody = JSON.parse(String(postsCalls[0]?.[1]?.body)) as { videos: unknown[] };
		expect(postsBody.videos).toEqual([
			{ youtubeVideoId: "yt-1", title: "Klip", thumbnailUrl: "https://t/1" },
		]);
	});

	it("awaria sieci przy tworzeniu posta → UploadFlowError (network, step create-post), nie 'Load failed'", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("Load failed");
			}),
		);

		const error = await createPost({
			description: "tekst",
			files: [],
			pendingVideos: [],
			mentions: [],
		}).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(UploadFlowError);
		const flowError = error as UploadFlowError;
		expect(flowError.step).toBe("create-post");
		expect(flowError.kind).toBe("network");
		expect(flowError.message).toContain("sprawdź połączenie");
		expect(flowError.message).not.toContain("Load failed");
	});

	it("awaria sieci przy tworzeniu posta → raport na /api/app/upload-failures", async () => {
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
			throw new TypeError("Load failed");
		});
		vi.stubGlobal("fetch", fetchMock);

		await createPost({ description: "tekst", files: [], pendingVideos: [], mentions: [] }).catch(
			() => {},
		);

		const reportCalls = fetchMock.mock.calls.filter(([u]) =>
			String(u).endsWith("/api/app/upload-failures"),
		);
		expect(reportCalls).toHaveLength(1);
		const body = JSON.parse(String(reportCalls[0]?.[1]?.body)) as { step: string; kind: string };
		expect(body.step).toBe("create-post");
		expect(body.kind).toBe("network");
	});

	it("HTTP 400 z serwera → detail zawiera komunikat błędu serwera (np. dlugość opisu)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				status: 400,
				json: async () => ({
					error: "Validation failed",
					details: {
						fieldErrors: { description: ["Too big: expected string to have <=2000 characters"] },
					},
				}),
			})),
		);

		const error = await createPost({
			description: "za długi",
			files: [],
			pendingVideos: [],
			mentions: [],
		}).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(UploadFlowError);
		const flowError = error as UploadFlowError;
		expect(flowError.kind).toBe("http");
		expect(flowError.detail).toContain("HTTP 400");
		expect(flowError.detail).toContain("Validation failed");
	});

	it("HTTP 400 za długi opis → konkretny komunikat 'tekst za długi' zamiast ogólnego", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				status: 400,
				json: async () => ({
					error: "Validation failed",
					details: {
						fieldErrors: { description: ["Too big: expected string to have <=2000 characters"] },
					},
				}),
			})),
		);

		const error = await createPost({
			description: "za długi",
			files: [],
			pendingVideos: [],
			mentions: [],
		}).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(UploadFlowError);
		const flowError = error as UploadFlowError;
		expect(flowError.message).toContain("za długi");
		expect(flowError.message).toContain("2000");
	});
});
