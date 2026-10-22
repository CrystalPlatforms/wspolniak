// SPDX-License-Identifier: AGPL-3.0-or-later
import { downloadImage, isAndroidWrapper, saveBlobViaBridge } from "@/lib/download-image";

function mockFetchSuccess() {
	const mockBlob = new Blob(["fake-image-data"], { type: "image/jpeg" });
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
			headers: { get: () => null },
			body: null,
		}),
	);
}

function mockFetchFailure() {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
}

function mockCreateObjectURL() {
	const url = "blob:http://localhost/fake";
	vi.stubGlobal("URL", {
		...URL,
		createObjectURL: vi.fn().mockReturnValue(url),
		revokeObjectURL: vi.fn(),
	});
	return url;
}

function mockAnchorElement() {
	const clickSpy = vi.fn();
	const anchor = { click: clickSpy, href: "", download: "", style: {} };
	const createElementSpy = vi.fn().mockReturnValue(anchor);
	const appendChildSpy = vi.fn();
	const removeChildSpy = vi.fn();

	vi.stubGlobal("document", {
		...document,
		createElement: createElementSpy,
		body: { appendChild: appendChildSpy, removeChild: removeChildSpy },
	});

	return { clickSpy, anchor, createElementSpy, appendChildSpy, removeChildSpy };
}

describe("downloadImage", () => {
	afterEach(() => vi.restoreAllMocks());

	it("fetches image and triggers download", async () => {
		mockFetchSuccess();
		const blobUrl = mockCreateObjectURL();
		const { clickSpy } = mockAnchorElement();

		await downloadImage("https://example.com/image.jpg", "photo.jpg");

		expect(fetch).toHaveBeenCalledWith("https://example.com/image.jpg");
		expect(clickSpy).toHaveBeenCalled();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl);
	});

	it("opens image in new tab on download failure", async () => {
		mockFetchFailure();
		const openSpy = vi.fn();
		vi.stubGlobal("window", { ...window, open: openSpy });

		await downloadImage("https://example.com/image.jpg", "photo.jpg");

		expect(openSpy).toHaveBeenCalledWith("https://example.com/image.jpg", "_blank");
	});
});

// Powłoka Androida (#225): blob+a[download] nie działa w WebView — pobieranie idzie
// przez nawigację na trasę attachment /api/app/images/:id/download, którą łapie
// DownloadListener (DownloadManager). Założenia: nazwa leci w query, cfImageId
// identyfikuje zdjęcie po stronie serwera (sesja autoryzuje).
describe("powłoka Androida (#225)", () => {
	afterEach(() => {
		delete (globalThis as Record<string, unknown>).WspolniakBridge;
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("saveBlobViaBridge przekazuje base64 do mostka i raportuje sukces", async () => {
		const saveFile = vi.fn((_name: string, _mime: string, _base64: string) => true);
		(globalThis as Record<string, unknown>).WspolniakBridge = {
			getPendingFiles: () => "[]",
			clearPendingFiles: () => {},
			saveFile,
		};

		const result = await saveBlobViaBridge(
			new Blob(["abc"], { type: "image/jpeg" }),
			"wakacje.jpg",
		);

		expect(result).toBe(true);
		expect(saveFile).toHaveBeenCalledWith(
			"wakacje.jpg",
			"image/jpeg",
			expect.not.stringContaining("data:"),
		);
		const base64 = saveFile.mock.calls[0]?.[2] ?? "";
		expect(atob(base64)).toBe("abc");
	});

	it("saveBlobViaBridge bez mostka zwraca false", async () => {
		expect(await saveBlobViaBridge(new Blob(["abc"]), "x.jpg")).toBe(false);
	});

	it("downloadImage używa saveOverride zamiast kotwicy (powłoka)", async () => {
		mockFetchSuccess();
		const createObjectSpy = vi.fn(() => "blob:http://localhost/fake");
		vi.stubGlobal("URL", {
			...URL,
			createObjectURL: createObjectSpy,
			revokeObjectURL: vi.fn(),
		});
		const saveOverride = vi.fn(async (_blob: Blob, _filename: string) => true);

		await downloadImage("https://example.com/image.jpg", "photo.jpg", undefined, saveOverride);

		expect(saveOverride).toHaveBeenCalledTimes(1);
		expect(saveOverride.mock.calls[0]?.[1]).toBe("photo.jpg");
		expect(createObjectSpy).not.toHaveBeenCalled();
	});

	it("isAndroidWrapper rozpoznaje obecność i brak mostka", () => {
		expect(isAndroidWrapper()).toBe(false);

		(globalThis as Record<string, unknown>).WspolniakBridge = {
			getPendingFiles: () => "[]",
			clearPendingFiles: () => {},
		};
		expect(isAndroidWrapper()).toBe(true);
	});
});
