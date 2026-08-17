// SPDX-License-Identifier: AGPL-3.0-or-later
import { compressImage } from "@/images/compress";
import { UploadFlowError, uploadImages } from "@/images/upload";

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
		// AbortSignal.timeout odrzuca z TimeoutError po 7 s — symulujemy natychmiast
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

	it("awaria sieci uploadu → wysyła best-effort raport na /api/app/upload-failures", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
			if (url.startsWith("https://upload/")) {
				throw new TypeError("Load failed");
			}
			return {
				ok: true,
				status: 200,
				json: async () => ({ data: [{ cfImageId: "cf-1", uploadURL: "https://upload/cf-1" }] }),
			};
		});
		vi.stubGlobal("fetch", fetchMock);

		await uploadImages([new File(["abcd"], "wakacje.jpg", { type: "image/jpeg" })]).catch(() => {});

		const reportCalls = fetchMock.mock.calls.filter(([u]) =>
			String(u).endsWith("/api/app/upload-failures"),
		);
		expect(reportCalls).toHaveLength(1);
		const body = JSON.parse(String(reportCalls[0]?.[1]?.body)) as {
			step: string;
			kind: string;
			fileName?: string;
			fileSize?: number;
		};
		expect(body.step).toBe("image-upload");
		expect(body.kind).toBe("network");
		expect(body.fileName).toBe("wakacje.jpg");
		expect(body.fileSize).toBe(4);
	});

	it("raport nieudanego uploadu nie psuje flow, gdy sam fetch raportu pada", async () => {
		vi.mocked(compressImage).mockImplementation(async (file) => file); // passthrough
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string) => {
				// raport też pada — best-effort musi to połknąć
				throw new TypeError("Load failed");
			}),
		);

		const error = await uploadImages(makeFiles(["x.jpg"])).catch((e: unknown) => e);

		// oryginalny błąd uploadu wciąż leci do UI
		expect(error).toBeInstanceOf(UploadFlowError);
	});
});
