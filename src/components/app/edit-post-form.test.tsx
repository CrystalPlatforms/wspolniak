// SPDX-License-Identifier: AGPL-3.0-or-later
// Video v2 F3 (#197): edycja dodaje wideo tak jak kompozytor (#251: przez
// „Dodaj załączniki”, tytuł z nazwy pliku, kafelek w siatce), istniejące i nowe
// wideo da się przestawiać przeciąganiem, × na istniejącym wymaga potwierdzenia
// i woła onVideoDelete DOKŁADNIE RAZ (YouTube delete po stronie route,
// fire-and-forget). Zapis wysyła videoPlan — existing 1:1, kolejność listy =
// kolejność odtwarzania.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	fireEvent,
	render as rtlRender,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { afterEach, vi } from "vitest";
import type { PostVideoEntry } from "@/db/posts/schema";
import { EditPostForm } from "./edit-post-form";

function render(ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) {
	return rtlRender(ui, { wrapper, ...options });
}

function wrapper({ children }: { children: ReactNode }) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

vi.mock("@/images/shrink", () => ({
	shrinkImageToLimit: vi.fn(),
	ShrinkError: class ShrinkError extends Error {
		name = "ShrinkError";
	},
}));

import { shrinkImageToLimit } from "@/images/shrink";

const mockShrink = vi.mocked(shrinkImageToLimit);

afterEach(() => {
	vi.clearAllMocks();
});

function makeVideo(name: string): PostVideoEntry {
	return {
		youtubeVideoId: name,
		title: name === "yt-1" ? "Pierwszy" : "Drugi",
		thumbnailUrl: `https://i.ytimg.com/vi/${name}/hq.jpg`,
	};
}

describe("EditPostForm — Video v2 F3 (#197)", () => {
	it("renders the add-video flow and existing videos together (us story 12)", () => {
		const { container } = render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				initialVideos={[makeVideo("yt-1")]}
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);

		// #251: istniejące wideo to kafelek w siatce — tytuł + miniatura z YouTube
		// (zamiast dawnej szerokiej karty z napisem „istniejące").
		const grid = container.querySelector("[role='listbox']");
		expect(grid?.contains(screen.getByText("Pierwszy"))).toBe(true);
		expect(container.querySelector("img[src*='i.ytimg.com/vi/yt-1']")).not.toBeNull();
	});

	it("removing an existing video requires confirmation and fires onVideoDelete exactly once (us stories 13–14)", async () => {
		const onVideoDelete = vi.fn();
		const onSubmit = vi.fn();
		const user = userEvent.setup();
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				initialVideos={[makeVideo("yt-1")]}
				onSubmit={onSubmit}
				onVideoDelete={onVideoDelete}
				isSubmitting={false}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /usuń wideo/i }));
		expect(screen.getByText(/usunąć wideo\?/i)).toBeDefined();

		// Anuluj — nic się nie dzieje.
		await user.click(screen.getByRole("button", { name: /anuluj/i }));
		expect(onVideoDelete).not.toHaveBeenCalled();

		// Ponownie → Usuń — delete dokładnie raz.
		await user.click(screen.getByRole("button", { name: /usuń wideo/i }));
		await user.click(screen.getByRole("button", { name: /^usuń$/i }));
		expect(onVideoDelete).toHaveBeenCalledExactlyOnceWith("yt-1");
		expect(screen.queryByText("Pierwszy")).toBeNull();
	});

	it("submits the video plan preserving list order (existing 1:1)", async () => {
		const onSubmit = vi.fn();
		const user = userEvent.setup();
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				initialVideos={[makeVideo("yt-2"), makeVideo("yt-1")]}
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				videoPlan: [
					{ kind: "existing", entry: makeVideo("yt-2") },
					{ kind: "existing", entry: makeVideo("yt-1") },
				],
			}),
		);
	});
});

describe("EditPostForm — za duże zdjęcie (issue #200)", () => {
	function fileOfSize(name: string, bytes: number, type = "image/jpeg"): File {
		return new File([new Uint8Array(bytes)], name, { type });
	}

	function renderForm() {
		const onSubmit = vi.fn((_data: { files: File[] }) => {});
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);
		return { onSubmit };
	}

	async function uploadFiles(files: File[]): Promise<void> {
		const input = document.querySelector("input[type='file']") as HTMLInputElement;
		await userEvent.upload(input, files);
	}

	it("dodaje za duży plik jako oflagowany podgląd (czerwony + wykrzyknik), zamiast odrzucać", async () => {
		renderForm();

		await uploadFiles([fileOfSize("duze.jpg", 20 * 1024 * 1024)]);

		const flag = screen.getByRole("button", { name: /za duże: duze\.jpg/i });
		expect(flag.className).toContain("bg-destructive");
		expect(flag.querySelector("svg")).not.toBeNull();
		expect(screen.getAllByRole("img")).toHaveLength(1);
	});

	it("klik oflagowanego podglądu otwiera dialog z błędem (nazwa, rozmiar, limit 19 MB)", async () => {
		renderForm();

		await uploadFiles([fileOfSize("duze.jpg", 20 * 1024 * 1024)]);
		await userEvent.click(screen.getByRole("button", { name: /za duże: duze\.jpg/i }));

		const dialog = screen.getByRole("dialog");
		expect(dialog.textContent).toContain("duze.jpg");
		expect(dialog.textContent).toContain("20 MB");
		expect(dialog.textContent).toContain("19 MB");
	});

	it("submit z oflagowanym zdjęciem jest zablokowany z konkretnym komunikatem", async () => {
		const { onSubmit } = renderForm();

		await uploadFiles([fileOfSize("duze.jpg", 20 * 1024 * 1024)]);
		await userEvent.click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		expect(screen.getByText(/kliknij jego podgląd/i)).toBeDefined();
		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getByRole("dialog")).toBeDefined();
	});

	it("zmniejszenie zdjęcia podmienia plik, zdejmuje flagę i umożliwia zapis", async () => {
		const { onSubmit } = renderForm();

		await uploadFiles([fileOfSize("duze.jpg", 20 * 1024 * 1024)]);
		await userEvent.click(screen.getByRole("button", { name: /za duże: duze\.jpg/i }));

		const small = fileOfSize("duze.webp", 400 * 1024, "image/webp");
		mockShrink.mockResolvedValueOnce(small);

		await userEvent.click(screen.getByRole("button", { name: /zmniejsz zdjęcie/i }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(screen.queryByRole("button", { name: /za duże/i })).toBeNull());

		await userEvent.click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		expect(onSubmit).toHaveBeenCalledTimes(1);
		const submitted = onSubmit.mock.calls[0]?.[0];
		expect(submitted?.files).toHaveLength(1);
		expect(submitted?.files[0]?.size).toBe(400 * 1024);
	});

	it("limit to 19 MB — 18 MB przechodzi bez flagi, 20 MB jest oflagowane", async () => {
		renderForm();

		await uploadFiles([fileOfSize("mniejsze.jpg", 18 * 1024 * 1024)]);
		expect(screen.queryByRole("button", { name: /za duże/i })).toBeNull();

		await uploadFiles([fileOfSize("duze.jpg", 20 * 1024 * 1024)]);
		expect(screen.getByRole("button", { name: /za duże: duze\.jpg/i })).toBeDefined();
	});
});

// #241: ankieta w edycji istniejącego posta jest TYLKO DO CZYTANIA — głosy muszą
// zostać wiarygodne, więc formularz nie może oferować edycji pytania ani opcji.
// #250: limit 10 zdjęć z prostym komunikatem „Maksymalnie 10 mediów” —
// bez nazwy pliku. Nadmiarowe zdjęcia są ODRZUCANE (nic nie dochodzi do
// listy), w przeciwieństwie do za dużych plików, które dochodzą oflagowane.
describe("EditPostForm — limit mediów (#250)", () => {
	function makePhoto(name: string): File {
		return new File(["x"], name, { type: "image/jpeg" });
	}

	function renderForm() {
		const onSubmit = vi.fn((_data: { files: File[] }) => {});
		const view = render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);
		return { onSubmit, container: view.container };
	}

	async function uploadFiles(files: File[]): Promise<void> {
		const input = document.querySelector("input[type='file']") as HTMLInputElement;
		await userEvent.upload(input, files);
	}

	it("odrzuca zdjęcia ponad 10 z komunikatem „Maksymalnie 10 mediów”", async () => {
		renderForm();

		await uploadFiles(Array.from({ length: 10 }, (_, i) => makePhoto(`foto-${i}.jpg`)));
		await uploadFiles([makePhoto("nadmiar-1.jpg"), makePhoto("nadmiar-2.jpg")]);

		expect(screen.getByRole("alert").textContent).toBe("Maksymalnie 10 mediów");
		expect(screen.getAllByRole("img")).toHaveLength(10);
	});

	it("hint limitu w pickerze: ukryty input ma title „Wybierz do 10 zdjęć”", () => {
		const { container } = renderForm();

		const input = container.querySelector("input[type='file']") as HTMLInputElement;
		expect(input.title).toBe("Wybierz do 10 zdjęć");
	});
});

describe("EditPostForm — ankieta read-only (#241)", () => {
	// #251: ankieta to kafelek w siatce jak przy tworzeniu, ale bez krzyżyka —
	// klik pokazuje jej treść do odczytu w dialogu.
	it("pokazuje ankietę jako kafelek tylko do odczytu: bez krzyżyka, bez inputów i bez głosowania", async () => {
		const user = userEvent.setup();
		const { container } = render(
			<EditPostForm
				postId="post-1"
				description="Opis"
				existingImages={[]}
				imageAccountHash="hash"
				initialPoll={{ question: "Gdzie na wakacje?", options: ["Morze", "Góry"] }}
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const tile = screen.getByRole("button", {
			name: "Ankieta (tylko do odczytu): Gdzie na wakacje?",
		});
		expect(container.querySelector("[role='listbox']")?.contains(tile)).toBe(true);
		expect(screen.queryByRole("button", { name: /^usuń gdzie na wakacje\?$/i })).toBeNull();

		await user.click(tile);

		const dialog = await screen.findByRole("dialog");
		expect(dialog.textContent).toContain("Gdzie na wakacje?");
		expect(dialog.textContent).toContain("Morze");
		expect(dialog.textContent).toContain("Góry");
		expect(dialog.textContent).toContain("nie można edytować po publikacji");
		// brak inputów ankiety (pytanie/opcje) i brak wierszy z aria-pressed (głosowanie)
		expect(screen.queryByLabelText(/pytanie/i)).toBeNull();
		expect(screen.queryByRole("button", { name: /głosuj na/i })).toBeNull();
		// reszta formularza edytowalna normalnie
		expect(container.querySelector("input[type='file']")).not.toBeNull();
	});

	it("bez ankiety sekcja read-only nie renderuje się", () => {
		render(
			<EditPostForm
				postId="post-1"
				description="Opis"
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);
		expect(screen.queryByText(/nie można edytować po publikacji/i)).toBeNull();
	});
});

// #251: ekran edycji wygląda dokładnie jak tworzenie posta — te same wspólne
// elementy kompozytora (nagłówek, pasek dodawania, siatka kafelków, przycisk).
// Założenia spisane przed RED:
// - tytuł zostaje „Edytuj post", przycisk „Zapisz zmiany" / „Zapisywanie...";
// - nagłówek rysuje forma (jak NewPostForm), ze strzałką „Wróć do posta";
// - kształt onSubmit do strony edycji bez zmian;
// - ankieta jest tylko do odczytu (serwer ignoruje poll w PATCH), a przycisk
//   „Dodaj ankietę" jest wyszarzony z podpowiedzią;
// - nowo wybrane wideo ma tytuł z nazwy pliku (bez okienka tytułu, jak przy tworzeniu);
// - nie testujemy tu strony (routes/) ani serwera.
describe("EditPostForm — wygląd jak tworzenie posta (#251)", () => {
	it("nagłówek rysuje forma: strzałka „Wróć do posta” i tytuł „Edytuj post”", async () => {
		const onBack = vi.fn();
		const user = userEvent.setup();
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={vi.fn()}
				onBack={onBack}
				isSubmitting={false}
			/>,
		);

		expect(screen.getByRole("heading", { name: "Edytuj post" })).toBeDefined();
		await user.click(screen.getByRole("button", { name: "Wróć do posta" }));
		expect(onBack).toHaveBeenCalledTimes(1);
	});

	it("jedna wybierarka jak w kompozytorze: bez filtra typów, wiele plików, podpowiedź limitu", () => {
		const { container } = render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const inputs = container.querySelectorAll("input[type='file']");
		expect(inputs).toHaveLength(1);
		const input = inputs[0] as HTMLInputElement;
		expect(input.accept).toBe("");
		expect(input.multiple).toBe(true);
		expect(input.title).toBe("Wybierz do 10 zdjęć");
	});

	it("wybór z „Dodaj załączniki” dzieli się po typie: zdjęcie, wideo i plik jako kafelki w jednej siatce", async () => {
		const { container } = render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);
		const input = container.querySelector("input[type='file']") as HTMLInputElement;

		await userEvent
			.setup()
			.upload(input, [
				new File(["x"], "fotka.jpg", { type: "image/jpeg" }),
				new File(["v"], "kotek.mp4", { type: "video/mp4" }),
				new File(["%PDF"], "dokument.pdf", { type: "application/pdf" }),
			]);

		// zdjęcie: podgląd img; wideo: kafelek z <video> i tytułem z nazwy pliku;
		// plik: kafelek z nazwą
		expect(screen.getByAltText("Podgląd 1")).toBeDefined();
		expect(container.querySelector("video")).not.toBeNull();
		expect(screen.getByText("kotek")).toBeDefined();
		expect(screen.getByText("dokument.pdf")).toBeDefined();
		expect(screen.getByRole("button", { name: "Usuń wideo kotek" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Usuń plik dokument.pdf" })).toBeDefined();
	});

	// Decyzja usera: pasek wygląda identycznie jak przy tworzeniu (3 przyciski),
	// ale w edycji ankieta jest niedostępna — przycisk zostaje wyszarzony.
	it("pasek dodawania jak w kompozytorze: 3 przyciski, „Dodaj ankietę” wyszarzony, bez starych przycisków", async () => {
		const user = userEvent.setup();
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);

		// Pasek kompozytora (edytor opisu ma własny toolbar, więc szukamy po nazwie).
		expect(screen.getByRole("toolbar", { name: /dodaj do posta/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /dodaj załączniki/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /dodaj położenie/i })).toBeDefined();
		// dawne osobne przyciski edycji zniknęły
		expect(screen.queryByRole("button", { name: /dodaj zdjęcia/i })).toBeNull();
		expect(screen.queryByTitle(/dodaj wideo/i)).toBeNull();
		expect(screen.queryByTestId("composer-files-toggle")).toBeNull();

		const pollButton = screen.getByRole("button", { name: /dodaj ankietę/i });
		expect(pollButton.getAttribute("aria-disabled")).toBe("true");
		expect(pollButton.title).toMatch(/nie można/i);
		await user.click(pollButton);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	// Plan zapisu (kształt onSubmit bez zmian względem dawnej edycji): istniejące
	// rzeczy posta idą 1:1, dopóki user ich nie ruszy.
	function renderFullPost(onSubmit = vi.fn()) {
		return render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[
					{ id: "img-1", cfImageId: "cf-1" },
					{ id: "img-2", cfImageId: "cf-2" },
				]}
				imageAccountHash="hash"
				initialVideos={[makeVideo("yt-1")]}
				initialFiles={[
					{ id: "f1", key: "k1", name: "dokument.pdf", size: 10, mimeType: "application/pdf" },
				]}
				initialLocation={{ lat: 50.5, lng: 20.25, label: "Domek babci" }}
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);
	}

	it("istniejące zdjęcia, wideo, plik i położenie stoją na siatce jako kafelki", () => {
		const { container } = renderFullPost();

		const grid = container.querySelector("[role='listbox']") as HTMLElement;
		const photo = screen.getByAltText("Podgląd 1") as HTMLImageElement;
		expect(grid.contains(photo)).toBe(true);
		expect(photo.getAttribute("src")).toBe("https://imagedelivery.net/hash/cf-1/thumbnail");
		expect(grid.contains(screen.getByText("Pierwszy"))).toBe(true);
		expect(grid.contains(screen.getByText("dokument.pdf"))).toBe(true);
		expect(screen.getByRole("button", { name: "Edytuj położenie: Domek babci" })).toBeDefined();
	});

	it("zapis bez zmian zostawia wszystko jak było", async () => {
		const onSubmit = vi.fn();
		renderFullPost(onSubmit);

		await userEvent.setup().click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith({
			description: "hello",
			files: [],
			removedImageIds: [],
			imageOrder: ["img-1", "img-2"],
			videoPlan: [{ kind: "existing", entry: makeVideo("yt-1") }],
			mentions: [],
			location: undefined,
			keptFiles: [{ key: "k1", name: "dokument.pdf", size: 10, mimeType: "application/pdf" }],
			newPostFiles: [],
			filesDirty: false,
		});
	});

	it("krzyżyki planują usunięcie zdjęcia, pliku i położenia", async () => {
		const onSubmit = vi.fn();
		renderFullPost(onSubmit);
		const user = userEvent.setup();

		await user.click(screen.getAllByRole("button", { name: "Usuń zdjęcie" })[0] as HTMLElement);
		await user.click(screen.getByRole("button", { name: "Usuń plik dokument.pdf" }));
		await user.click(screen.getByRole("button", { name: "Usuń Domek babci" }));
		await user.click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				removedImageIds: ["img-1"],
				imageOrder: ["img-2"],
				location: null,
				keptFiles: [],
				filesDirty: true,
			}),
		);
		// kafelki zniknęły z siatki
		expect(screen.getAllByRole("img", { name: /podgląd/i })).toHaveLength(1);
		expect(screen.queryByText("dokument.pdf")).toBeNull();
		expect(screen.queryByRole("button", { name: /edytuj położenie/i })).toBeNull();
	});

	it("nowo wybrane rzeczy trafiają do planu zapisu: zdjęcie, wideo (tytuł z nazwy pliku) i plik", async () => {
		const onSubmit = vi.fn();
		const { container } = renderFullPost(onSubmit);
		const input = container.querySelector("input[type='file']") as HTMLInputElement;
		const photo = new File(["x"], "fotka.jpg", { type: "image/jpeg" });
		const video = new File(["v"], "kotek.mp4", { type: "video/mp4" });
		const pdf = new File(["%PDF"], "notatka.pdf", { type: "application/pdf" });

		await userEvent.setup().upload(input, [photo, video, pdf]);
		await userEvent.setup().click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				files: [photo],
				videoPlan: [
					{ kind: "existing", entry: makeVideo("yt-1") },
					{ kind: "pending", file: video, title: "kotek" },
				],
				keptFiles: [{ key: "k1", name: "dokument.pdf", size: 10, mimeType: "application/pdf" }],
				newPostFiles: [pdf],
				filesDirty: true,
			}),
		);
	});

	/**
	 * Sztuczny layout kafelków w jsdom: 100 px obok siebie (jsdom nie ma layoutu,
	 * więc bez tego każdy element ma współrzędne zerowe). Zwraca funkcję sprzątającą.
	 */
	function layoutTiles() {
		const tiles = () => Array.from(document.querySelectorAll("[role='listbox'] [role='option']"));
		const rects = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
			this: Element,
		) {
			const left = Math.max(tiles().indexOf(this), 0) * 100;
			return {
				x: left,
				y: 0,
				left,
				top: 0,
				width: 100,
				height: 100,
				right: left + 100,
				bottom: 100,
				toJSON: () => ({}),
			} as DOMRect;
		});
		return () => rects.mockRestore();
	}

	/**
	 * Prawdziwe przeciągnięcie kafelka na drugi. jsdom nie ma PointerEvent, więc
	 * zdarzenia myszy udają wskaźnik (sensor dnd-kit startuje tylko na zdarzeniu
	 * isPrimary). Aktywacja wymaga ruchu o więcej niż 5 px, a wszystkie zdarzenia
	 * muszą trafić w przeciągany element.
	 */
	function dragTileTo(source: Element, target: Element) {
		const tiles = Array.from(document.querySelectorAll("[role='listbox'] [role='option']"));
		const leftOf = (tile: Element) => Math.max(tiles.indexOf(tile), 0) * 100;
		const pointer = (type: string, x: number) => {
			const event = new MouseEvent(type, {
				bubbles: true,
				cancelable: true,
				clientX: x,
				clientY: 50,
				button: 0,
			});
			Object.defineProperty(event, "isPrimary", { value: true });
			act(() => {
				source.dispatchEvent(event);
			});
		};
		const stopLayout = layoutTiles();

		try {
			pointer("pointerdown", leftOf(source) + 50);
			pointer("pointermove", leftOf(source) + 60);
			pointer("pointermove", leftOf(target) + 50);
			pointer("pointerup", leftOf(target) + 50);
		} finally {
			stopLayout();
		}
	}

	// Decyzja usera: edycja zachowuje przeciąganie wideo (kolejność odtwarzania).
	it("kafelki wideo można przestawiać przeciąganiem — nowa kolejność trafia do planu zapisu", async () => {
		const onSubmit = vi.fn();
		const { container } = render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				initialVideos={[makeVideo("yt-1"), makeVideo("yt-2")]}
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);
		const grid = container.querySelector("[role='listbox']") as HTMLElement;
		const tiles = within(grid).getAllByRole("option");
		expect(tiles).toHaveLength(2);

		dragTileTo(tiles[0] as HTMLElement, tiles[1] as HTMLElement);
		await userEvent.click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				videoPlan: [
					{ kind: "existing", entry: makeVideo("yt-2") },
					{ kind: "existing", entry: makeVideo("yt-1") },
				],
			}),
		);
	});

	it("istniejące zdjęcia można przestawiać — nowa kolejność trafia do imageOrder", async () => {
		const onSubmit = vi.fn();
		const { container } = render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[
					{ id: "img-1", cfImageId: "cf-1" },
					{ id: "img-2", cfImageId: "cf-2" },
				]}
				imageAccountHash="hash"
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);
		const tiles = within(container.querySelector("[role='listbox']") as HTMLElement).getAllByRole(
			"option",
		);

		dragTileTo(tiles[0] as HTMLElement, tiles[1] as HTMLElement);

		// kolejność widoczna od razu na siatce…
		const sources = within(container)
			.getAllByRole("img", { name: /podgląd/i })
			.map((img) => img.getAttribute("src"));
		expect(sources).toEqual([
			"https://imagedelivery.net/hash/cf-2/thumbnail",
			"https://imagedelivery.net/hash/cf-1/thumbnail",
		]);

		// …i trafia do planu zapisu
		await userEvent.click(screen.getByRole("button", { name: /zapisz zmiany/i }));
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({ imageOrder: ["img-2", "img-1"], removedImageIds: [] }),
		);
	});

	// Alternatywa klawiaturowa dla przeciągania (dostępność: gest nie może być
	// jedyną drogą): Enter na kafelku z fokusem startuje przestawianie, strzałka
	// przesuwa, Enter potwierdza.
	it("kafelki da się przestawić klawiaturą: Enter, strzałka w prawo, Enter", async () => {
		const onSubmit = vi.fn();
		const { container } = render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				initialVideos={[makeVideo("yt-1"), makeVideo("yt-2")]}
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);
		const grid = container.querySelector("[role='listbox']") as HTMLElement;
		const tiles = within(grid).getAllByRole("option");
		const stopLayout = layoutTiles();

		try {
			(tiles[0] as HTMLElement).focus();
			await userEvent.keyboard("{Enter}{ArrowRight}{Enter}");
		} finally {
			stopLayout();
		}

		await userEvent.click(screen.getByRole("button", { name: /zapisz zmiany/i }));
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				videoPlan: [
					{ kind: "existing", entry: makeVideo("yt-2") },
					{ kind: "existing", entry: makeVideo("yt-1") },
				],
			}),
		);
	});

	// Decyzja usera („1 ale dodać loader”): przycisk zapisu wygląda jak przycisk
	// publikacji — ten sam rozmiar, podczas zapisu niebieski, pasek postępu, biały
	// loader i etykiety postępu zdjęć/wideo. Po zapisie wraca do posta od razu,
	// bez min. 7 s jak przy publikacji (to strona edycji decyduje, nie forma).
	// `isSubmitting` i postęp dochodzą w każdym renderze z osobna.
	const submitProps: Omit<ComponentProps<typeof EditPostForm>, "isSubmitting"> = {
		postId: "p1",
		description: "hello",
		existingImages: [],
		imageAccountHash: "hash",
		onSubmit: vi.fn(),
	};

	it("przycisk „Zapisz zmiany” wygląda jak przycisk publikacji: podczas zapisu jest niebieski, z paskiem i białym loaderem", () => {
		const { rerender } = render(<EditPostForm {...submitProps} isSubmitting={false} />);

		const idle = screen.getByRole("button", { name: "Zapisz zmiany" }) as HTMLButtonElement;
		expect(idle.className).toContain("h-11");
		expect(idle.disabled).toBe(false);

		rerender(<EditPostForm {...submitProps} isSubmitting />);
		const busy = screen.getByRole("button", { name: /zapisywanie/i }) as HTMLButtonElement;
		expect(busy.disabled).toBe(true);
		expect(busy.className).toContain("bg-[#0c275f]");
		expect(busy.querySelector("[class*='publish-indeterminate']")).not.toBeNull();
		const loader = busy.querySelector("output.loader");
		expect(loader).not.toBeNull();
		expect(loader?.getAttribute("style")).toContain("#FFFFFF");
	});

	it("pokazuje postęp wgrywania na przycisku i ostrzeżenie o wolnym łączu — jak przy publikacji", () => {
		const { rerender } = render(
			<EditPostForm
				{...submitProps}
				isSubmitting
				imageProgress={{ fileName: "2.jpg", fileIndex: 1, total: 3, percent: 45 }}
			/>,
		);
		expect(screen.getByText(/Zdjęcie 2\/3 — 45%/)).toBeDefined();

		rerender(
			<EditPostForm
				{...submitProps}
				isSubmitting
				imageProgress={null}
				uploadProgress={{ videoIndex: 0, total: 2, percent: 40 }}
			/>,
		);
		expect(screen.getByText(/Wgrywanie wideo 1\/2/)).toBeDefined();

		rerender(<EditPostForm {...submitProps} isSubmitting isSlowUpload />);
		expect(screen.getByText(/wolne połączenie internetowe/i)).toBeDefined();
		expect(screen.getByRole("button", { name: /zapisywanie/i })).toBeDefined();
	});

	// Parzystość walidacji z kompozytorem: „pusty post" to brak tekstu, załączników,
	// ankiety i położenia. Dotąd edycja liczyła tylko tekst, zdjęcia i wideo, więc
	// posta z samymi plikami, ankietą albo położeniem nie dało się zapisać.
	const pdf = { id: "f1", key: "k1", name: "dokument.pdf", size: 10, mimeType: "application/pdf" };

	it("post z samymi plikami da się zapisać — przycisk jest aktywny, jak przy tworzeniu", async () => {
		const onSubmit = vi.fn();
		render(
			<EditPostForm
				postId="p1"
				description=""
				existingImages={[]}
				imageAccountHash="hash"
				initialFiles={[pdf]}
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);

		const save = screen.getByRole("button", { name: /zapisz zmiany/i }) as HTMLButtonElement;
		expect(save.disabled).toBe(false);
		await userEvent.click(save);
		expect(onSubmit).toHaveBeenCalledTimes(1);
	});

	it("post z samą ankietą i położeniem da się zapisać", async () => {
		const onSubmit = vi.fn();
		render(
			<EditPostForm
				postId="p1"
				description=""
				existingImages={[]}
				imageAccountHash="hash"
				initialPoll={{ question: "Gdzie?", options: ["A", "B"] }}
				initialLocation={{ lat: 50.5, lng: 20.25, label: "Domek babci" }}
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);

		const save = screen.getByRole("button", { name: /zapisz zmiany/i }) as HTMLButtonElement;
		expect(save.disabled).toBe(false);
		await userEvent.click(save);
		expect(onSubmit).toHaveBeenCalledTimes(1);
	});

	it("pusty post daje ten sam komunikat co kompozytor", () => {
		const onSubmit = vi.fn();
		const { container } = render(
			<EditPostForm
				postId="p1"
				description=""
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);

		fireEvent.submit(container.querySelector("form") as HTMLFormElement);

		expect(screen.getByRole("alert").textContent).toBe(
			"Dodaj tekst, załączniki, ankietę albo położenie",
		);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("za długi opis daje ten sam komunikat co kompozytor", async () => {
		const onSubmit = vi.fn();
		render(
			<EditPostForm
				postId="p1"
				description={"a".repeat(2001)}
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		expect(screen.getByRole("alert").textContent).toBe(
			"Tekst posta jest za długi. Limit to 2000 znaków, wpisanych: 2001",
		);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("za duże zdjęcie daje ten sam komunikat co kompozytor", async () => {
		const onSubmit = vi.fn();
		const { container } = render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);
		const input = container.querySelector("input[type='file']") as HTMLInputElement;
		await userEvent
			.setup()
			.upload(input, [
				new File([new Uint8Array(20 * 1024 * 1024)], "duze.jpg", { type: "image/jpeg" }),
			]);

		await userEvent.click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		// Otwarty dialog „za duże zdjęcie" ukrywa resztę strony przed wyszukiwaniem
		// po roli, stąd hidden: true.
		expect(screen.getByRole("alert", { hidden: true }).textContent).toBe(
			'Zdjęcie "duze.jpg" jest za duże. Kliknij jego podgląd i zmniejsz je, albo usuń je przed publikacją.',
		);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	// Limity jak w kompozytorze (10 zdjęć / 5 wideo / 5 plików), liczone razem
	// z tym, co już jest w poście. Nadmiar jest ODRZUCANY z komunikatem.
	it("11. zdjęcie, 6. wideo i 6. plik są odrzucane, gdy post ma już pełne limity", async () => {
		const { container } = render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={Array.from({ length: 10 }, (_, i) => ({
					id: `img-${i}`,
					cfImageId: `cf-${i}`,
				}))}
				imageAccountHash="hash"
				initialVideos={Array.from({ length: 5 }, (_, i) => makeVideo(`yt-${i}`))}
				initialFiles={Array.from({ length: 5 }, (_, i) => ({
					id: `f-${i}`,
					key: `k-${i}`,
					name: `plik-${i}.pdf`,
					size: 10,
					mimeType: "application/pdf",
				}))}
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);
		const input = container.querySelector("input[type='file']") as HTMLInputElement;

		await userEvent
			.setup()
			.upload(input, [
				new File(["x"], "nadmiar.jpg", { type: "image/jpeg" }),
				new File(["v"], "nadmiar.mp4", { type: "video/mp4" }),
				new File(["%PDF"], "nadmiar.pdf", { type: "application/pdf" }),
			]);

		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("Maksymalnie 10 mediów");
		expect(alert.textContent).toContain("nadmiar.mp4: limit 5 wideo");
		expect(alert.textContent).toContain("nadmiar.pdf: limit 5 plików");
		// nic ponad limity nie doszło do siatki
		expect(screen.getAllByRole("img", { name: /podgląd/i })).toHaveLength(10);
		expect(container.querySelectorAll("video")).toHaveLength(0);
		expect(screen.queryByText("nadmiar.pdf")).toBeNull();
	});

	it("plik inny niż zdjęcie powyżej 19 MB jest odrzucany z komunikatem o limicie", async () => {
		const { container } = render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);
		const input = container.querySelector("input[type='file']") as HTMLInputElement;

		await userEvent
			.setup()
			.upload(input, [
				new File([new Uint8Array(20 * 1024 * 1024)], "wielki.pdf", { type: "application/pdf" }),
			]);

		expect(screen.getByRole("alert").textContent).toBe("wielki.pdf: przekracza limit 19 MB");
		expect(screen.queryByText("wielki.pdf")).toBeNull();
	});
});
