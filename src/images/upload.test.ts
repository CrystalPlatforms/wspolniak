// SPDX-License-Identifier: AGPL-3.0-or-later
import { compressImage } from "@/images/compress";
import { type ImageUploadProgress, UploadFlowError, uploadImages } from "@/images/upload";
import { FakeXHR } from "@/test/fake-xhr";

vi.mock("@/images/compress", () => ({
	compressImage: vi.fn(),
}));

/**
 * Założenia (issue #203): upload POJEDYNCZEGO pliku idzie przez XMLHttpRequest,
 * bo fetch nie wspiera upload progress w Safari — `xhr.upload.onprogress` daje
 * realne bajty. FakeXHR to granica przeglądarki: test steruje progressem
 * (loaded/total) i odpowiedzią. Upload NIE ma twardego limitu czasu — leci
 * do skutku (20 s limit przerywał transfer, który by się dokończył na LTE).
 */
/** Stub fetch TYLKO dla batch upload-urls — upload pliku ma iść przez XHR. */
function stubFetch(pairsFor: (count: number) => { cfImageId: string; uploadURL: string }[]) {
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		if (url.endsWith("/api/app/images/upload-urls")) {
			const body = JSON.parse(String(init?.body)) as { count: number };
			return { ok: true, status: 200, json: async () => ({ data: pairsFor(body.count) }) };
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function makeFiles(names: string[]): File[] {
	return names.map((name) => new File(["x"], name, { type: "image/jpeg" }));
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	FakeXHR.instances = [];
});

describe("uploadImages", () => {
	it("uploaduje pliki przez XHR (nie fetch): batch upload-urls + POST FormData per plik, cfImageId w kolejności", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		stubFetch((count) =>
			Array.from({ length: count }, (_, i) => ({
				cfImageId: `cf-${i + 1}`,
				uploadURL: `https://upload/cf-${i + 1}`,
			})),
		);
		vi.stubGlobal("XMLHttpRequest", FakeXHR);

		const promise = uploadImages(makeFiles(["1.jpg", "2.jpg"]), {});
		await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(2));
		expect(FakeXHR.instances.map((x) => x.url)).toEqual([
			"https://upload/cf-1",
			"https://upload/cf-2",
		]);
		expect(FakeXHR.instances[0]?.method).toBe("POST");
		expect(FakeXHR.instances[0]?.body).toBeInstanceOf(FormData);

		FakeXHR.instances[0]?.respond(200);
		FakeXHR.instances[1]?.respond(200);
		await expect(promise).resolves.toEqual(["cf-1", "cf-2"]);
	});

	it("awaria sieci przy uploadzie pliku (XHR onerror) → UploadFlowError (network) z polskim komunikatem, nie 'Load failed'", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		stubFetch(() => [{ cfImageId: "cf-1", uploadURL: "https://upload/cf-1" }]);
		vi.stubGlobal("XMLHttpRequest", FakeXHR);

		const promise = uploadImages(makeFiles(["wakacje.jpg"]), {});
		await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
		FakeXHR.instances[0]?.fail();

		const error = await promise.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(UploadFlowError);
		const flowError = error as UploadFlowError;
		expect(flowError.kind).toBe("network");
		expect(flowError.step).toBe("image-upload");
		expect(flowError.fileName).toBe("wakacje.jpg");
		expect(flowError.message).toContain("sprawdź połączenie");
		expect(flowError.message).not.toContain("Load failed");
	});

	it("progres % per plik z realnych bajtów (upload.onprogress): 0 → 50 → 100", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		stubFetch(() => [{ cfImageId: "cf-1", uploadURL: "https://upload/cf-1" }]);
		vi.stubGlobal("XMLHttpRequest", FakeXHR);

		const events: ImageUploadProgress[] = [];
		const promise = uploadImages(makeFiles(["duze.jpg"]), {
			onProgress: (p) => events.push(p),
		});
		await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
		FakeXHR.instances[0]?.progress(0, 2_000_000);
		FakeXHR.instances[0]?.progress(1_000_000, 2_000_000);
		FakeXHR.instances[0]?.progress(2_000_000, 2_000_000);
		FakeXHR.instances[0]?.respond(200);
		await promise;

		expect(events).toEqual([
			{ fileName: "duze.jpg", fileIndex: 0, total: 1, percent: 0 },
			{ fileName: "duze.jpg", fileIndex: 0, total: 1, percent: 50 },
			{ fileName: "duze.jpg", fileIndex: 0, total: 1, percent: 100 },
		]);
	});

	// Założenie (issue #203): twardy limit czasu dotyczy TYLKO szybkich JSON
	// requestów (batch upload-urls, create-post — 7 s). Upload pliku leci do
	// skutku: XHR bez `timeout`, bez AbortSignal — 20 s limit przerywał transfer,
	// który na LTE by się dokończył.
	it("upload pliku NIE ma twardego limitu: AbortSignal tylko dla JSON (7 s), XHR bez timeout", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
		stubFetch(() => [{ cfImageId: "cf-1", uploadURL: "https://upload/cf-1" }]);
		vi.stubGlobal("XMLHttpRequest", FakeXHR);

		const promise = uploadImages(makeFiles(["duze.jpg"]), {});
		await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
		expect(FakeXHR.instances[0]?.timeout).toBe(0); // brak limitu na XHR
		FakeXHR.instances[0]?.respond(200);
		await promise;

		// JSON (batch upload-urls) zostaje na 7 s; plik nie dostaje AbortSignal
		// (przed #203 spy pokazywał [7000, 20000]).
		expect(timeoutSpy.mock.calls.map((c) => c[0])).toEqual([7_000]);
		timeoutSpy.mockRestore();
	});

	// Założenie (issue #203): równoległość serii = 2 (dolna granica przedziału
	// „1–2 pliki naraz" z issue). Daje pipelining — kompresja N+1 w Web Workerze
	// podczas gdy N leci po sieci — bez dzielenia wąskiego pasma LTE między
	// wszystkie pliki naraz (pełne Promise.all wbijało każdy w 20 s limit).
	it("ogranicza równoległość serii do 2 plików naraz, wyniki w kolejności plików", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		stubFetch((count) =>
			Array.from({ length: count }, (_, i) => ({
				cfImageId: `cf-${i + 1}`,
				uploadURL: `https://upload/cf-${i + 1}`,
			})),
		);
		vi.stubGlobal("XMLHttpRequest", FakeXHR);

		const promise = uploadImages(makeFiles(["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"]), {});
		// startują dokładnie 2 (nie wszystkie 5 naraz)
		await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(2));
		expect(FakeXHR.instances.map((x) => x.url)).toEqual([
			"https://upload/cf-1",
			"https://upload/cf-2",
		]);

		FakeXHR.instances[0]?.respond(200); // plik 1 done → startuje plik 3
		await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(3));
		expect(FakeXHR.instances[2]?.url).toBe("https://upload/cf-3");

		FakeXHR.instances[1]?.respond(200); // plik 2 done → startuje plik 4
		await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(4));

		FakeXHR.instances[2]?.respond(200); // plik 3 done → startuje plik 5
		await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(5));

		FakeXHR.instances[3]?.respond(200);
		FakeXHR.instances[4]?.respond(200);
		await expect(promise).resolves.toEqual(["cf-1", "cf-2", "cf-3", "cf-4", "cf-5"]);
	});

	// Założenia (issue #203): „wolne łącze" mierzy REALNĄ przepustowość (B/s) z
	// progress eventów XHR, nie czas. Próg 100 KB/s, okno pomiaru min. 2 s
	// (SLOW_LINK_THRESHOLD_BPS / SLOW_LINK_MIN_SAMPLE_MS) — ostrzeżenie wołane
	// RAZ na plik, nie przerywa uploadu.
	it("wolne łącze: przepustowość < 100 KB/s po 2 s → onSlowLink raz na plik", async () => {
		vi.useFakeTimers();
		try {
			vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
			stubFetch(() => [{ cfImageId: "cf-1", uploadURL: "https://upload/cf-1" }]);
			vi.stubGlobal("XMLHttpRequest", FakeXHR);
			vi.setSystemTime(0);

			const slowLinks: string[] = [];
			const promise = uploadImages(makeFiles(["duze.jpg"]), {
				onSlowLink: (f) => slowLinks.push(f),
			});
			await vi.advanceTimersByTimeAsync(0); // flush mikro-zadań → XHR utworzony
			expect(FakeXHR.instances).toHaveLength(1);

			FakeXHR.instances[0]?.progress(150_000, 2_000_000); // t=0 — start pomiaru
			await vi.advanceTimersByTimeAsync(2_500);
			FakeXHR.instances[0]?.progress(100_000, 2_000_000); // 40 KB/s < 100 → wolne
			expect(slowLinks).toEqual(["duze.jpg"]); // dokładnie raz

			// kolejny event poniżej progu — bez drugiego ostrzeżenia
			await vi.advanceTimersByTimeAsync(100);
			FakeXHR.instances[0]?.progress(120_000, 2_000_000);
			expect(slowLinks).toEqual(["duze.jpg"]);

			FakeXHR.instances[0]?.respond(200);
			await expect(promise).resolves.toEqual(["cf-1"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("szybkie łącze (≥ 100 KB/s) → onSlowLink niewołane", async () => {
		vi.useFakeTimers();
		try {
			vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
			stubFetch(() => [{ cfImageId: "cf-1", uploadURL: "https://upload/cf-1" }]);
			vi.stubGlobal("XMLHttpRequest", FakeXHR);
			vi.setSystemTime(0);

			const slowLinks: string[] = [];
			const promise = uploadImages(makeFiles(["duze.jpg"]), {
				onSlowLink: (f) => slowLinks.push(f),
			});
			await vi.advanceTimersByTimeAsync(0);
			expect(FakeXHR.instances).toHaveLength(1);

			// 1.5 MB w 2.5 s = 600 KB/s — daleko powyżej progu
			FakeXHR.instances[0]?.progress(500_000, 2_000_000);
			await vi.advanceTimersByTimeAsync(2_500);
			FakeXHR.instances[0]?.progress(1_500_000, 2_000_000);
			await vi.advanceTimersByTimeAsync(100);
			expect(slowLinks).toEqual([]);

			FakeXHR.instances[0]?.respond(200);
			await expect(promise).resolves.toEqual(["cf-1"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("telemetria etapów: compress i transfer (durationMs, bytes) — console.info domyślnie", async () => {
		vi.mocked(compressImage).mockImplementation(
			async (file) => new File([file], file.name, { type: file.type }),
		);
		stubFetch(() => [{ cfImageId: "cf-1", uploadURL: "https://upload/1" }]);
		vi.stubGlobal("XMLHttpRequest", FakeXHR);
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		const promise = uploadImages(makeFiles(["duze.jpg"]), {});
		await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
		FakeXHR.instances[0]?.respond(200);
		await promise;

		const entries = infoSpy.mock.calls.map((c) => c[1]);
		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({ stage: "compress", fileName: "duze.jpg" });
		expect(entries[0]?.durationMs).toBeGreaterThanOrEqual(0);
		expect(entries[1]).toMatchObject({ stage: "transfer", bytes: 1 });
	});

	it("HTTP 500 z uploadu → UploadFlowError (http) z nazwą pliku", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		stubFetch(() => [{ cfImageId: "cf-1", uploadURL: "https://upload/cf-1" }]);
		vi.stubGlobal("XMLHttpRequest", FakeXHR);

		const promise = uploadImages(makeFiles(["zepsute.jpg"]), {});
		await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
		FakeXHR.instances[0]?.respond(500);
		const error = await promise.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(UploadFlowError);
		const flowError = error as UploadFlowError;
		expect(flowError.kind).toBe("http");
		expect(flowError.step).toBe("image-upload");
		expect(flowError.fileName).toBe("zepsute.jpg");
		expect(flowError.detail).toContain("HTTP 500");
	});
});
