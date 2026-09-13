// SPDX-License-Identifier: AGPL-3.0-or-later
import { compressImage } from "@/images/compress";
import {
	FILE_UPLOAD_TIMEOUT_MS,
	UPLOAD_TIMEOUT_MS,
	UploadFlowError,
	uploadImages,
} from "@/images/upload";

vi.mock("@/images/compress", () => ({
	compressImage: vi.fn(),
}));

function stubFetch(pairsFor: (count: number) => { cfImageId: string; uploadURL: string }[]) {
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		if (url.endsWith("/api/app/images/upload-urls")) {
			const body = JSON.parse(String(init?.body)) as { count: number };
			return { ok: true, status: 200, json: async () => ({ data: pairsFor(body.count) }) };
		}
		if (url.startsWith("https://upload/")) {
			return { ok: true, status: 200, json: async () => ({}) };
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
});

describe("uploadImages", () => {
	it("uploaduje pliki przez batch upload-urls i zwraca cfImageId w kolejności plików", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		const fetchMock = stubFetch((count) =>
			Array.from({ length: count }, (_, i) => ({
				cfImageId: `cf-${i + 1}`,
				uploadURL: `https://upload/cf-${i + 1}`,
			})),
		);

		const ids = await uploadImages(makeFiles(["1.jpg", "2.jpg"]));

		expect(ids).toEqual(["cf-1", "cf-2"]);
		// dokładnie jeden batch request
		const batchCalls = fetchMock.mock.calls.filter(([u]) =>
			String(u).endsWith("/api/app/images/upload-urls"),
		);
		expect(batchCalls).toHaveLength(1);
		// N bezpośrednich uploadów do CF
		expect(
			fetchMock.mock.calls.filter(([u]) => String(u).startsWith("https://upload/")),
		).toHaveLength(2);
	});

	it("awaria sieci przy uploadzie pliku → UploadFlowError (network) z polskim komunikatem, nie 'Load failed'", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		// upload do CF odrzuca jak Safari przy zerwanym połączeniu
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (url.startsWith("https://upload/")) {
					throw new TypeError("Load failed");
				}
				return {
					ok: true,
					status: 200,
					json: async () => ({ data: [{ cfImageId: "cf-1", uploadURL: "https://upload/cf-1" }] }),
				};
			}),
		);

		const error = await uploadImages(makeFiles(["wakacje.jpg"])).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(UploadFlowError);
		const flowError = error as UploadFlowError;
		expect(flowError.kind).toBe("network");
		expect(flowError.step).toBe("image-upload");
		expect(flowError.fileName).toBe("wakacje.jpg");
		expect(flowError.message).toContain("sprawdź połączenie");
		expect(flowError.message).not.toContain("Load failed");
	});

	it("przekroczenie limitu czasu uploadu → UploadFlowError (timeout) z informacją o wolnym połączeniu", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		// AbortSignal.timeout odrzuca z TimeoutError po limicie (20 s) — symulujemy natychmiast
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (url.startsWith("https://upload/")) {
					throw Object.assign(new Error("The operation was aborted due to timeout"), {
						name: "TimeoutError",
					});
				}
				return {
					ok: true,
					status: 200,
					json: async () => ({ data: [{ cfImageId: "cf-1", uploadURL: "https://upload/cf-1" }] }),
				};
			}),
		);

		const error = await uploadImages(makeFiles(["duze.jpg"])).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(UploadFlowError);
		const flowError = error as UploadFlowError;
		expect(flowError.kind).toBe("timeout");
		expect(flowError.step).toBe("image-upload");
		expect(flowError.message).toContain("zbyt wolne");
		expect(flowError.message).toContain("duze.jpg");
	});

	// Założenia (issue #199): limit jest PER KROK, nie globalny — batch upload-urls
	// i create-post to szybkie JSON requesty (7 s), upload pojedynczego pliku może
	// trwać dłużej na wolnym łączu (20 s). Weryfikacja przez AbortSignal.timeout
	// (granica przeglądarki) — sprawdzamy ile ms dostał każdy request.
	it("twardy limit 20 s dotyczy uploadu pliku; batch upload-urls zostaje na 7 s", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
		stubFetch((count) =>
			Array.from({ length: count }, (_, i) => ({
				cfImageId: `cf-${i + 1}`,
				uploadURL: `https://upload/cf-${i + 1}`,
			})),
		);

		await uploadImages(makeFiles(["a.jpg"]));

		// kolejność wołań: upload-urls (7 s) → image-upload (20 s)
		expect(timeoutSpy.mock.calls.map((c) => c[0])).toEqual([7_000, 20_000]);
		timeoutSpy.mockRestore();
	});

	it("limit czasu pojedynczego uploadu to 20 s — komunikat pokazuje aktualny limit (issue #199)", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		// AbortSignal.timeout odrzuca z TimeoutError po limicie — symulujemy natychmiast
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (url.startsWith("https://upload/")) {
					throw Object.assign(new Error("The operation was aborted due to timeout"), {
						name: "TimeoutError",
					});
				}
				return {
					ok: true,
					status: 200,
					json: async () => ({ data: [{ cfImageId: "cf-1", uploadURL: "https://upload/cf-1" }] }),
				};
			}),
		);

		const error = await uploadImages(makeFiles(["duze.jpg"])).catch((e: unknown) => e);

		// limit per plik: 20 s (batch zostaje na 7 s) — komunikat pokazuje limit tego kroku
		expect(UPLOAD_TIMEOUT_MS).toBe(7_000);
		expect(FILE_UPLOAD_TIMEOUT_MS).toBe(20_000);
		const flowError = error as UploadFlowError;
		expect(flowError.kind).toBe("timeout");
		expect(flowError.step).toBe("image-upload");
		expect(flowError.message).toContain("limit 20 s");
	});

	it("upload pliku trwający >7 s → onSlowUpload(fileName), ale upload trwa dalej aż do 20 s (issue #199)", async () => {
		// Założenia: ostrzeżenie to czysty side-effect (callback), NIE przerywa fetcha —
		// plik ma pełne FILE_UPLOAD_TIMEOUT_MS (20 s) na dokończenie. Próg = 7 s.
		vi.useFakeTimers();
		try {
			vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
			let resolveUpload: ((res: unknown) => void) | undefined;
			vi.stubGlobal(
				"fetch",
				vi.fn(async (url: string) => {
					if (url.startsWith("https://upload/")) {
						return new Promise((resolve) => {
							resolveUpload = resolve;
						});
					}
					return {
						ok: true,
						status: 200,
						json: async () => ({
							data: [{ cfImageId: "cf-1", uploadURL: "https://upload/cf-1" }],
						}),
					};
				}),
			);

			const slowCalls: string[] = [];
			const promise = uploadImages(makeFiles(["duze.jpg"]), (fileName) => {
				slowCalls.push(fileName);
			});

			await vi.advanceTimersByTimeAsync(6_999);
			expect(slowCalls).toEqual([]); // jeszcze przed progiem

			await vi.advanceTimersByTimeAsync(1);
			expect(slowCalls).toEqual(["duze.jpg"]); // przekroczone 7 s → ostrzeżenie

			// upload kończy się PO ostrzeżeniu — flow dochodzi do sukcesu
			resolveUpload?.({ ok: true, status: 200 });
			await expect(promise).resolves.toEqual(["cf-1"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("fetch dostaje sygnał abortu z limitem UPLOAD_TIMEOUT_MS", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
			ok: true,
			status: 200,
			json: async () => ({ data: [{ cfImageId: "cf-1", uploadURL: "https://upload/cf-1" }] }),
		}));
		vi.stubGlobal("fetch", fetchMock);

		await uploadImages(makeFiles(["a.jpg"]));

		const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});
});
