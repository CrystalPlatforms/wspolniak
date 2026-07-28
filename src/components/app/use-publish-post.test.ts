// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient } from "@tanstack/react-query";
import { feedQueryKey } from "@/components/app/feed-query";
import { compressImage } from "@/images/compress";
import {
	createPost,
	PUBLISH_BAR_DURATION_MS,
	type PublishPostInput,
	runPublishFlow,
} from "./use-publish-post";

vi.mock("@/images/compress", () => ({
	compressImage: vi.fn(),
}));

function makeQueryClient() {
	return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const sampleInput: PublishPostInput = {
	description: "Cześć",
	files: [],
	videoIds: [],
	mentions: [],
};

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
			input: sampleInput,
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
		expect(navigate).toHaveBeenCalledWith({ to: "/app" });
	});

	it("powolny publish (>czasu paska): nie czeka dodatkowo, navigate od razu (pasek już pełny)", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(PUBLISH_BAR_DURATION_MS + 1000); // "teraz" = 8s

		const qc = makeQueryClient();
		vi.spyOn(qc, "refetchQueries").mockResolvedValue(undefined);
		const navigate = vi.fn().mockResolvedValue(undefined);

		await runPublishFlow({
			input: sampleInput,
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
				input: sampleInput,
				navigate,
				queryClient: qc,
				createPostFn,
				startedAt: 0,
			}),
		).rejects.toThrow("upload nie powiódł się");

		expect(refetchSpy).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});
});

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

		await createPost({ description: "hi", files, videoIds: [], mentions: [] });

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

		await createPost({ description: "brak zdjęć", files: [], videoIds: [], mentions: [] });

		const calls = fetchMock.mock.calls.map(([u]) => String(u));
		expect(calls.filter((u) => u.endsWith("/api/app/images/upload-urls"))).toHaveLength(0);
		expect(calls.filter((u) => u.endsWith("/api/app/posts"))).toHaveLength(1);
	});
});
