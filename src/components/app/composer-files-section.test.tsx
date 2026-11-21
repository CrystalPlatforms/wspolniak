// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu ComposerFilesSection (#243, spisane przed testami):
// - przycisk "Dodaj pliki" otwiera natywną wybierarkę (input hidden, klik programowy
//   nie przechodzi w jsdom — testy walidują pomocnikami i stanem listy);
// - limity: max 5 plików na post (istniejące się liczą przez existingCount),
//   19 MB na plik, wideo zablokowane;
// - lista wybranych z krzyżykiem usuwania; komunikat odrzucenia ma role=alert.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComposerFilesSection, formatPostFileSize } from "./composer-files-section";

afterEach(() => {
	cleanup();
});

function makeFile(name: string, size: number, type = "application/pdf"): File {
	return { name, size, type } as unknown as File;
}

describe("ComposerFilesSection", () => {
	it("przycisk rozwija listę po dodaniu plików", () => {
		const files = [makeFile("raport.pdf", 1024)];
		const onChange = vi.fn();
		render(<ComposerFilesSection files={files} onChange={onChange} />);

		expect(screen.getByText("raport.pdf")).toBeDefined();
		expect(screen.getByText("1 KB")).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: /usuń plik raport\.pdf/i }));
		expect(onChange).toHaveBeenCalledWith([]);
	});

	it("przycisk 'Usuń wszystkie pliki' czyści listę", () => {
		const files = [makeFile("a.pdf", 10), makeFile("b.pdf", 20)];
		const onChange = vi.fn();
		render(<ComposerFilesSection files={files} onChange={onChange} />);

		fireEvent.click(screen.getByRole("button", { name: /usuń wszystkie pliki/i }));
		expect(onChange).toHaveBeenCalledWith([]);
	});
});

describe("walidacja plików", () => {
	it("formatPostFileSize czytelnie formatuje rozmiar", () => {
		expect(formatPostFileSize(512)).toBe("512 B");
		expect(formatPostFileSize(12.5 * 1024)).toContain("KB");
		expect(formatPostFileSize(3.2 * 1024 * 1024)).toContain("MB");
	});

	it("wybierarka: wideo odrzucone z komunikatem (role=alert)", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ComposerFilesSection files={[]} onChange={onChange} />);

		const input = document.getElementById("composer-files-input") as HTMLInputElement;
		await user.upload(input, [makeFile("kotek.mp4", 1000, "video/mp4")]);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("pliki wideo nie są obsługiwane");
		expect(onChange).not.toHaveBeenCalled();
	});

	it("wybierarka: plik >19 MB odrzucony z komunikatem", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ComposerFilesSection files={[]} onChange={onChange} />);

		const input = document.getElementById("composer-files-input") as HTMLInputElement;
		await user.upload(input, [makeFile("duzy.bin", 20 * 1024 * 1024, "application/octet-stream")]);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("limit 19 MB");
		expect(onChange).not.toHaveBeenCalled();
	});

	it("wybierarka: 6 plików → 5 przyjętych + komunikat o limicie", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ComposerFilesSection files={[]} onChange={onChange} />);

		const input = document.getElementById("composer-files-input") as HTMLInputElement;
		const six = Array.from({ length: 6 }, (_, i) => makeFile(`plik-${i + 1}.pdf`, 100));
		await user.upload(input, six);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("limit 5 plików");
		expect(onChange).toHaveBeenCalledTimes(1);
		const accepted = onChange.mock.calls[0]?.[0] as File[];
		expect(accepted).toHaveLength(5);
	});

	it("istniejące załączniki liczą się do limitu (existingCount, edycja)", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ComposerFilesSection files={[]} onChange={onChange} existingCount={4} />);

		const input = document.getElementById("composer-files-input") as HTMLInputElement;
		await user.upload(input, [makeFile("a.pdf", 10), makeFile("b.pdf", 10)]);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("limit 5 plików");
		const accepted = onChange.mock.calls[0]?.[0] as File[];
		expect(accepted).toHaveLength(1);
	});
});
