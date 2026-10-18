// SPDX-License-Identifier: AGPL-3.0-or-later
import { putPendingFiles, takePendingFiles } from "./waiting-room";

function makeFile(name: string, type = "image/jpeg"): File {
	return new File(["x"], name, { type });
}

describe("waiting room (poczekalnia plików, #220)", () => {
	// Izolacja: stan modułu jest globalny (singleton) — każdy test startuje
	// z opróżnioną poczekalnią, żeby pliki nie przeciekały między testami.
	beforeEach(() => {
		takePendingFiles();
	});

	it("wydaje pliki włożone przez putPendingFiles", () => {
		const photo = makeFile("wakacje.jpg");
		const video = makeFile("kotek.mp4", "video/mp4");
		putPendingFiles([photo, video]);

		expect(takePendingFiles()).toEqual([photo, video]);
	});

	it("odbior czyści poczekalnię — drugi odbior jest pusty", () => {
		putPendingFiles([makeFile("wakacje.jpg")]);
		takePendingFiles();

		expect(takePendingFiles()).toEqual([]);
	});

	it("nowy put zastepuje wczesniejszy intake (brak draft protection — decyzja PRD)", () => {
		putPendingFiles([makeFile("stare.jpg")]);
		const nowy = makeFile("nowe.jpg");
		putPendingFiles([nowy]);

		expect(takePendingFiles()).toEqual([nowy]);
	});
});
