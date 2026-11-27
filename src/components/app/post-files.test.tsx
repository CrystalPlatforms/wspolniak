// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu PostFilesList (#243, spisane przed testami):
// - wiersze: ikona wg MIME, nazwa, czytelny rozmiar, przycisk pobierz;
// - pobieranie = fetch do AUTORYZOWANEGO endpointu /api/app/posts/:id/files/:fileId
//   (prywatny bucket — nigdy bezpośrednio do R2), potem zapis bloba;
// - brak plików → komponent renderuje null (karta bez sekcji);
// - porażka fetcha → toast błędu, bez wysypu strony.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { formatPostFileSize, PostFilesList } from "./post-files";

vi.mock("sonner", () => ({
	toast: { error: vi.fn() },
}));

import { toast } from "sonner";

const FILES = [
	{ id: "file-1", key: "a-1", name: "dokument.pdf", size: 2048, mimeType: "application/pdf" },
	{ id: "file-2", key: "a-2", name: "notatka.txt", size: 512, mimeType: "text/plain" },
];

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("PostFilesList", () => {
	it("renderuje wiersze: nazwa, rozmiar, przycisk pobierz", () => {
		render(<PostFilesList postId="post-1" files={FILES} />);

		expect(screen.getByText("dokument.pdf")).toBeDefined();
		expect(screen.getByText("notatka.txt")).toBeDefined();
		expect(screen.getByText("2 KB")).toBeDefined();
		expect(screen.getByRole("button", { name: /pobierz dokument\.pdf/i })).toBeDefined();
	});

	it("brak plików → komponent niewidoczny", () => {
		const { container } = render(<PostFilesList postId="post-1" files={[]} />);
		expect(container.querySelector("[data-post-files]")).toBeNull();
	});

	it("klik pobierz trafia w auth endpoint z id pliku", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			blob: async () => new Blob(["BYTES"], { type: "application/pdf" }),
		}));
		vi.stubGlobal("fetch", fetchMock);
		// ścieżka zapisu DOM (anchor) działa w jsdom bez interwencji
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

		render(<PostFilesList postId="post-1" files={FILES} />);
		fireEvent.click(screen.getByRole("button", { name: /pobierz dokument\.pdf/i }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith("/api/app/posts/post-1/files/file-1");
		});
	});

	it("porażka fetcha → toast błędu, bez wywalenia strony", async () => {
		const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }));
		vi.stubGlobal("fetch", fetchMock);

		render(<PostFilesList postId="post-1" files={FILES} />);
		fireEvent.click(screen.getByRole("button", { name: /pobierz notatka\.txt/i }));

		await waitFor(() => {
			expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Nie udało się pobrać pliku");
		});
	});
});

describe("formatPostFileSize", () => {
	it("czytelnie formatuje rozmiar", () => {
		expect(formatPostFileSize(512)).toBe("512 B");
		expect(formatPostFileSize(12.5 * 1024)).toContain("KB");
		expect(formatPostFileSize(3.2 * 1024 * 1024)).toContain("MB");
	});
});
