// SPDX-License-Identifier: AGPL-3.0-or-later
// Dialog tworzenia albumu (#170): uploadImages = granica sieci (mock), POST
// /api/app/albums = granica sieci (fetch stub). Walidacja kliencka: tytuł +
// ≥1 zdjęcie blokują submit PRZED jakimkolwiek wołaniem sieciowym.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { AlbumCreateDialog } from "./album-create-dialog";

vi.mock("@/images/upload", () => ({
	uploadImages: vi.fn(),
}));

import { uploadImages } from "@/images/upload";

const mockUploadImages = vi.mocked(uploadImages);

function renderDialog(
	overrides: { onCreated?: (album: { id: string; title: string }) => void } = {},
) {
	const onCreated = overrides.onCreated ?? vi.fn();
	render(<AlbumCreateDialog open onOpenChange={() => {}} onCreated={onCreated} />);
	return { onCreated };
}

function photoFile(name: string) {
	return new File(["bytes"], name, { type: "image/jpeg" });
}

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("AlbumCreateDialog", () => {
	it("blocks submit without a title before any network call", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		renderDialog();

		await userEvent.click(screen.getByRole("button", { name: /^utwórz$/i }));

		expect(screen.getByRole("alert").textContent).toContain("tytuł");
		expect(mockUploadImages).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("blocks submit without photos before any network call", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		renderDialog();

		await userEvent.type(screen.getByLabelText(/^tytuł$/i), "Wakacje");
		await userEvent.click(screen.getByRole("button", { name: /^utwórz$/i }));

		expect(screen.getByRole("alert").textContent).toContain("zdjęcie");
		expect(mockUploadImages).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("removes a photo via the red X before submit (reviza usera)", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		renderDialog();

		const input = screen.getByLabelText(/dodaj zdjęcia/i) as HTMLInputElement;
		await userEvent.upload(input, [photoFile("a.jpg"), photoFile("b.jpg")]);

		// Widoczny czerwony X na każdym zdjęciu; klik w X pierwszego usuwa je.
		const removeFirst = screen.getByRole("button", { name: "Usuń zdjęcie 1" });
		expect(removeFirst.querySelector("svg")).not.toBeNull();
		await userEvent.click(removeFirst);

		// Zostało jedno zdjęcie (numeracja od nowa — etykiety odzwierciedlają aktualną listę).
		expect(screen.getAllByRole("button", { name: /usuń zdjęcie/i })).toHaveLength(1);
		expect(screen.getByRole("button", { name: /dodaj zdjęcia/i }).textContent).toContain("(1)");
	});

	it("uploads photos first, then creates the album with returned cf ids", async () => {
		mockUploadImages.mockResolvedValue(["cf-1", "cf-2"]);
		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			status: 201,
			json: () => Promise.resolve({ data: { id: "album-new", title: "Wakacje" } }),
		});
		vi.stubGlobal("fetch", fetchSpy);
		const { onCreated } = renderDialog();

		await userEvent.type(screen.getByLabelText(/^tytuł$/i), "Wakacje");
		const input = screen.getByLabelText(/dodaj zdjęcia/i) as HTMLInputElement;
		await userEvent.upload(input, [photoFile("a.jpg"), photoFile("b.jpg")]);

		await userEvent.click(screen.getByRole("button", { name: /^utwórz$/i }));

		await waitFor(() => {
			expect(onCreated).toHaveBeenCalledWith({ id: "album-new", title: "Wakacje" });
		});
		// Upload przed create: pliki → cfImageIds w kolejności.
		expect(mockUploadImages).toHaveBeenCalledTimes(1);
		const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string) as {
			title: string;
			photoIds: string[];
		};
		expect(body).toEqual({ title: "Wakacje", photoIds: ["cf-1", "cf-2"] });
	});

	it("shows the server error when create fails", async () => {
		mockUploadImages.mockResolvedValue(["cf-1"]);
		const fetchSpy = vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ error: "Validation failed" }),
		});
		vi.stubGlobal("fetch", fetchSpy);
		renderDialog();

		await userEvent.type(screen.getByLabelText(/^tytuł$/i), "Wakacje");
		const input = screen.getByLabelText(/dodaj zdjęcia/i) as HTMLInputElement;
		await userEvent.upload(input, [photoFile("a.jpg")]);
		await userEvent.click(screen.getByRole("button", { name: /^utwórz$/i }));

		await waitFor(() => {
			// Konkretna przyczyna serwera trafia do komunikatu (wzorzec #135).
			expect(screen.getByRole("alert").textContent).toContain("Validation failed");
		});
	});
});

// Tryb append (#171): „Dodaj zdjęcia" w widoku albumu — bez pola tytuł,
// upload → POST /api/app/albums/:id/items z kind own_image.
describe("AlbumCreateDialog — tryb append (#171)", () => {
	function renderAppendDialog(albumId = "album-1") {
		const onCreated = vi.fn();
		render(
			<AlbumCreateDialog
				open
				onOpenChange={() => {}}
				onCreated={onCreated}
				mode="append"
				albumId={albumId}
			/>,
		);
		return { onCreated };
	}

	it("hides the title field and submits photos to the items endpoint", async () => {
		mockUploadImages.mockResolvedValue(["cf-9", "cf-8"]);
		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			status: 201,
			json: () => Promise.resolve({ data: { added: 2 } }),
		});
		vi.stubGlobal("fetch", fetchSpy);
		const { onCreated } = renderAppendDialog();

		// Tryb append: bez pola tytuł; przycisk submit to „Dodaj".
		expect(screen.queryByLabelText(/^tytuł$/i)).toBeNull();
		// { selector: "input" } — tytuł dialogu („Dodaj zdjęcia") też pasuje do regexu.
		const input = screen.getByLabelText(/dodaj zdjęcia/i, {
			selector: "input",
		}) as HTMLInputElement;
		await userEvent.upload(input, [photoFile("a.jpg"), photoFile("b.jpg")]);
		await userEvent.click(screen.getByRole("button", { name: /^dodaj$/i }));

		await waitFor(() => {
			expect(onCreated).toHaveBeenCalledWith({ id: "album-1", title: "" });
		});
		expect(fetchSpy).toHaveBeenCalledWith("/api/app/albums/album-1/items", expect.anything());
		const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		expect(JSON.parse(init.body as string)).toEqual({
			kind: "own_image",
			refs: ["cf-9", "cf-8"],
		});
	});

	it("blocks submit without photos also in append mode", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		renderAppendDialog();

		await userEvent.click(screen.getByRole("button", { name: /^dodaj$/i }));

		expect(screen.getByRole("alert").textContent).toContain("zdjęcie");
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
