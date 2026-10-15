// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu przygotowania załączników (F4 #217):
// - Limity: maks. 5 plików na wiadomość (liczone względem już wybranych), 19 MB
//   na plik, MIME `video/*` odrzucone (stojąca reguła: wideo tylko przez YouTube).
// - Zdjęcia przechodzą przez pipeline #200 (`shrinkImageToLimit`) — w testach
//   mockujemy SAMĄ GRANICĘ Web Workera (jsdom nie uruchamia workerów; pipeline
//   ma własne testy z fałszywym Workerem). Przypadki: sukces → zmniejszony plik;
//   ShrinkError + oryginał w limicie → zostaje oryginał; ShrinkError + oryginał
//   ponad limit → odrzucenie z komunikatem.
// - Pliki nieobrazowe (PDF itp.) przechodzą bez zmian.
import { ShrinkError, shrinkImageToLimit } from "@/images/shrink";
import { formatBytes, prepareAttachments } from "./chat-attachments";

vi.mock("@/images/shrink", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/images/shrink")>();
	return {
		...actual,
		shrinkImageToLimit: vi.fn(),
	};
});

const mockedShrink = vi.mocked(shrinkImageToLimit);

function makeFile(name: string, size: number, type: string): File {
	// size ponad realną zawartość stringa jest w porządku — walidacja czyta `size`.
	const file = new File(["x"], name, { type });
	Object.defineProperty(file, "size", { value: size });
	return file;
}

describe("prepareAttachments", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("accepts a plain PDF unchanged (no shrink)", async () => {
		const pdf = makeFile("dokument.pdf", 1024, "application/pdf");
		const result = await prepareAttachments([pdf], 0);

		expect(result.accepted).toEqual([pdf]);
		expect(result.rejected).toEqual([]);
		expect(mockedShrink).not.toHaveBeenCalled();
	});

	it("rejects a video file with a visible reason", async () => {
		const video = makeFile("film.mp4", 1024, "video/mp4");
		const result = await prepareAttachments([video], 0);

		expect(result.accepted).toEqual([]);
		expect(result.rejected).toEqual([
			{ name: "film.mp4", reason: "pliki wideo nie są obsługiwane" },
		]);
	});

	it("rejects a file over 19 MB before any shrink attempt", async () => {
		const big = makeFile("hiper.jpg", 19 * 1024 * 1024 + 1, "image/jpeg");
		const result = await prepareAttachments([big], 0);

		expect(result.accepted).toEqual([]);
		expect(result.rejected[0]?.reason).toContain("19 MB");
		expect(mockedShrink).not.toHaveBeenCalled();
	});

	it("blocks the 6th file of a message", async () => {
		const files = Array.from({ length: 6 }, (_, i) =>
			makeFile(`plik-${i}.pdf`, 100, "application/pdf"),
		);
		const result = await prepareAttachments(files, 0);

		expect(result.accepted).toHaveLength(5);
		expect(result.rejected).toEqual([
			{ name: "plik-5.pdf", reason: "limit 5 plików na wiadomość" },
		]);
	});

	it("counts existing attachments toward the 5-file limit", async () => {
		const files = Array.from({ length: 2 }, (_, i) =>
			makeFile(`plik-${i}.pdf`, 100, "application/pdf"),
		);
		const result = await prepareAttachments(files, 4);

		expect(result.accepted).toHaveLength(1);
		expect(result.rejected).toHaveLength(1);
	});

	it("shrinks an image through the #200 pipeline", async () => {
		const photo = makeFile("zdjecie.jpg", 1024, "image/jpeg");
		const shrunk = makeFile("zdjecie.webp", 512, "image/webp");
		mockedShrink.mockResolvedValue(shrunk);
		const result = await prepareAttachments([photo], 0);

		expect(mockedShrink).toHaveBeenCalledWith(photo, 19 * 1024 * 1024);
		expect(result.accepted).toEqual([shrunk]);
	});

	it("keeps the original when shrink fails (oryginał już przeszedł bramkę 19 MB)", async () => {
		const photo = makeFile("kolos.jpg", 19 * 1024 * 1024 - 1, "image/jpeg");
		mockedShrink.mockRejectedValue(new ShrinkError("nie dało się"));
		const result = await prepareAttachments([photo], 0);

		expect(result.accepted).toEqual([photo]);
		expect(result.rejected).toEqual([]);
	});
});

describe("formatBytes", () => {
	it("formats bytes, kilobytes and megabytes (pl-PL)", () => {
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(2048)).toBe("2 KB");
		expect(formatBytes(3 * 1024 * 1024)).toBe("3 MB");
	});
});
