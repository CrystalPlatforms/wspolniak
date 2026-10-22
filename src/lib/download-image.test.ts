// SPDX-License-Identifier: AGPL-3.0-or-later
import { downloadImage, downloadImageNative, isAndroidWrapper } from "@/lib/download-image";

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

	it("downloadImageNative kieruje na trasę attachment z nazwą w query", () => {
		const assignSpy = vi.fn();
		vi.stubGlobal("window", { ...window, location: { assign: assignSpy } });

		downloadImageNative("cf-9", "wakacje.jpg");

		expect(assignSpy).toHaveBeenCalledWith("/api/app/images/cf-9/download?name=wakacje.jpg");
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
