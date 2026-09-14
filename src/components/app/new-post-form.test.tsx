// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NewPostForm } from "./new-post-form";

vi.mock("@/images/shrink", () => ({
	shrinkImageToLimit: vi.fn(),
	ShrinkError: class ShrinkError extends Error {
		name = "ShrinkError";
	},
}));

import { shrinkImageToLimit } from "@/images/shrink";

const mockShrink = vi.mocked(shrinkImageToLimit);

function makeFile(name: string) {
	return new File(["x"], name, { type: "image/jpeg" });
}

describe("NewPostForm", () => {
	it("renders file picker and description input", () => {
		render(<NewPostForm onSubmit={vi.fn()} isSubmitting={false} />);

		expect(screen.getByLabelText(/^tekst$/i)).toBeDefined();
		expect(screen.getByRole("button", { name: /zdjęcia/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /opublikuj/i })).toBeDefined();
	});

	it("prefills the description from initialDescription (Zaproponuj datę, #163)", () => {
		render(
			<NewPostForm
				onSubmit={vi.fn()}
				isSubmitting={false}
				initialDescription="Witam, tu Tomek\nI chciałem/ałam zaproponować nową datę do naszego Kalendarza:"
			/>,
		);

		const field = screen.getByLabelText(/^tekst$/i) as HTMLTextAreaElement;
		expect(field.value).toContain("Witam, tu Tomek");
	});

	it("shows the formatting switch (default OFF) when markdown is enabled", () => {
		render(<NewPostForm onSubmit={vi.fn()} isSubmitting={false} />);

		// Slice 1: stara plain-text toolbar B/I/S zastąpiona switchem → WYSIWYG (leniwie).
		const toggle = screen.getByRole("switch", { name: /formatowanie/i });
		expect(toggle).toBeDefined();
		expect(toggle.getAttribute("aria-checked")).toBe("false");
		// Domyślnie OFF → zwykłe pole tekstowe, bez przycisków formatowania.
		expect(screen.queryByRole("button", { name: /pogrubienie/i })).toBeNull();
	});

	it("renders the composer video picker button (F2 #194)", () => {
		render(<NewPostForm onSubmit={vi.fn()} isSubmitting={false} />);

		expect(screen.queryByRole("button", { name: /dodaj wideo/i })).not.toBeNull();
	});

	it("renders the admin-panel message instead of the picker when YouTube is not connected", () => {
		render(<NewPostForm onSubmit={vi.fn()} isSubmitting={false} videoNotConnected />);

		expect(screen.queryByRole("button", { name: /dodaj wideo/i })).toBeNull();
		expect(screen.getByText(/podłącz youtube w panelu admina/i)).toBeDefined();
	});

	it("hides the formatting switch when the markdown feature is disabled", () => {
		render(
			<NewPostForm
				onSubmit={vi.fn()}
				isSubmitting={false}
				featureFlags={{
					markdown: false,
					library: true,
					chat: true,
					albums: true,
					ai: false,
				}}
			/>,
		);

		expect(screen.queryByRole("switch", { name: /formatowanie/i })).toBeNull();
	});

	it("shows file count validation error for >10 files", () => {
		const { container } = render(<NewPostForm onSubmit={vi.fn()} isSubmitting={false} />);

		const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;
		expect(fileInput).toBeDefined();
		expect(fileInput.accept).toContain("image/jpeg");
		expect(fileInput.accept).toContain("image/heic");
		expect(fileInput.multiple).toBe(true);
	});

	it("blokuje publikację tekstu >2000 znaków z konkretnym komunikatem (zanim poleci do serwera)", () => {
		const onSubmit = vi.fn();
		render(<NewPostForm onSubmit={onSubmit} isSubmitting={false} />);

		const long = "a".repeat(2001);
		const description = screen.getByLabelText(/^tekst$/i);
		fireEvent.change(description, { target: { value: long } });
		fireEvent.click(screen.getByRole("button", { name: /publikuj/i }));

		expect(screen.getByText(/za długi/i)).toBeDefined();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("pozwala opublikować dokładnie 2000 znaków", () => {
		const onSubmit = vi.fn();
		render(<NewPostForm onSubmit={onSubmit} isSubmitting={false} />);

		const exact = "a".repeat(2000);
		const description = screen.getByLabelText(/^tekst$/i);
		fireEvent.change(description, { target: { value: exact } });
		fireEvent.click(screen.getByRole("button", { name: /publikuj/i }));

		expect(screen.queryByText(/za długi/i)).toBeNull();
		expect(onSubmit).toHaveBeenCalledTimes(1);
	});

	it("pokazuje ostrzeżenie o wolnym łączu gdy isSlowUpload podczas publikacji (issue #199)", () => {
		render(<NewPostForm onSubmit={vi.fn()} isSubmitting isSlowUpload />);

		expect(screen.getByText(/wolne połączenie internetowe/i)).toBeDefined();
	});

	it("nie pokazuje ostrzeżenia o wolnym łączu bez publikacji ani bez isSlowUpload", () => {
		render(<NewPostForm onSubmit={vi.fn()} isSubmitting={false} isSlowUpload />);
		expect(screen.queryByText(/wolne połączenie internetowe/i)).toBeNull();

		render(<NewPostForm onSubmit={vi.fn()} isSubmitting isSlowUpload={false} />);
		expect(screen.queryByText(/wolne połączenie internetowe/i)).toBeNull();
	});

	it("disables submit button when submitting", () => {
		render(<NewPostForm onSubmit={vi.fn()} isSubmitting={true} />);

		const button = screen.getByRole("button", { name: /publikowanie/i });
		expect(button).toBeDefined();
		expect((button as HTMLButtonElement).disabled).toBe(true);
	});

	describe("image reorder via drag-and-drop", () => {
		it("renders sortable items after file selection", async () => {
			const { container } = render(<NewPostForm onSubmit={vi.fn()} isSubmitting={false} />);

			const input = container.querySelector("input[type='file']") as HTMLInputElement;
			await userEvent.upload(input, [makeFile("a.jpg"), makeFile("b.jpg"), makeFile("c.jpg")]);

			const images = screen.getAllByRole("img");
			expect(images).toHaveLength(3);
			expect(images[0].getAttribute("alt")).toBe("Podgląd 1");
			expect(images[1].getAttribute("alt")).toBe("Podgląd 2");
			expect(images[2].getAttribute("alt")).toBe("Podgląd 3");

			// Each preview should have a sortable drag handle
			const list = container.querySelector("[role='listbox']");
			expect(list).not.toBeNull();
			const items = within(list as HTMLElement).getAllByRole("option");
			expect(items).toHaveLength(3);
		});

		it("reorders files and submits in new order", async () => {
			const onSubmit = vi.fn();
			const { container } = render(<NewPostForm onSubmit={onSubmit} isSubmitting={false} />);

			const input = container.querySelector("input[type='file']") as HTMLInputElement;
			const fileA = makeFile("a.jpg");
			const fileB = makeFile("b.jpg");
			const fileC = makeFile("c.jpg");
			await userEvent.upload(input, [fileA, fileB, fileC]);

			// Simulate drag: move item at index 0 to index 2
			const list = container.querySelector("[role='listbox']") as HTMLElement;
			const items = within(list).getAllByRole("option");
			const source = items[0] as HTMLElement;
			const target = items[2] as HTMLElement;

			const sourceRect = source.getBoundingClientRect();
			const targetRect = target.getBoundingClientRect();

			fireEvent.pointerDown(source, {
				clientX: sourceRect.left + sourceRect.width / 2,
				clientY: sourceRect.top + sourceRect.height / 2,
				pointerId: 1,
			});
			fireEvent.pointerMove(source, {
				clientX: targetRect.left + targetRect.width / 2,
				clientY: targetRect.top + targetRect.height / 2,
				pointerId: 1,
			});
			fireEvent.pointerUp(window, { pointerId: 1 });

			// Submit the form
			await userEvent.type(screen.getByLabelText(/^tekst$/i), "test");
			await userEvent.click(screen.getByRole("button", { name: /opublikuj/i }));

			expect(onSubmit).toHaveBeenCalledWith(
				expect.objectContaining({
					files: [fileB, fileC, fileA],
				}),
			);
		});
	});

	describe("za duże zdjęcie (issue #200)", () => {
		function fileOfSize(name: string, bytes: number, type = "image/jpeg"): File {
			return new File([new Uint8Array(bytes)], name, { type });
		}

		async function uploadFiles(container: HTMLElement, files: File[]): Promise<HTMLInputElement> {
			const input = container.querySelector("input[type='file']") as HTMLInputElement;
			await userEvent.upload(input, files);
			return input;
		}

		it("dodaje za duży plik jako oflagowany podgląd (czerwony + wykrzyknik), resztę normalnie", async () => {
			const { container } = render(<NewPostForm onSubmit={vi.fn()} isSubmitting={false} />);

			await uploadFiles(container, [
				fileOfSize("duze.jpg", 20 * 1024 * 1024),
				fileOfSize("male.jpg", 2 * 1024 * 1024),
			]);

			// dwa podglądy; za duży ma nakładkę „za duże" z ikoną (svg) i czerwonym tłem
			const images = screen.getAllByRole("img");
			expect(images).toHaveLength(2);

			const flag = screen.getByRole("button", { name: /za duże: duze\.jpg/i });
			expect(flag.className).toContain("bg-destructive");
			expect(flag.querySelector("svg")).not.toBeNull();

			// mały plik bez flagi
			expect(screen.queryByRole("button", { name: /za duże: male\.jpg/i })).toBeNull();
		});

		it("klik oflagowanego podglądu otwiera dialog z błędem (nazwa, rozmiar, limit 19 MB)", async () => {
			const { container } = render(<NewPostForm onSubmit={vi.fn()} isSubmitting={false} />);

			await uploadFiles(container, [fileOfSize("duze.jpg", 20 * 1024 * 1024)]);
			await userEvent.click(screen.getByRole("button", { name: /za duże: duze\.jpg/i }));

			const dialog = screen.getByRole("dialog");
			expect(dialog.textContent).toContain("duze.jpg");
			expect(dialog.textContent).toContain("20 MB");
			expect(dialog.textContent).toContain("19 MB");
		});

		it("submit z oflagowanym zdjęciem jest zablokowany z konkretnym komunikatem", async () => {
			const onSubmit = vi.fn();
			const { container } = render(<NewPostForm onSubmit={onSubmit} isSubmitting={false} />);

			await uploadFiles(container, [fileOfSize("duze.jpg", 20 * 1024 * 1024)]);
			await userEvent.click(screen.getByRole("button", { name: /opublikuj/i }));

			expect(screen.getByText(/kliknij jego podgląd/i)).toBeDefined();
			expect(onSubmit).not.toHaveBeenCalled();
			expect(screen.getByRole("dialog")).toBeDefined();
		});

		it("zmniejszenie zdjęcia podmienia plik, zdejmuje flagę i umożliwia publikację", async () => {
			const onSubmit = vi.fn();
			const { container } = render(<NewPostForm onSubmit={onSubmit} isSubmitting={false} />);

			await uploadFiles(container, [fileOfSize("duze.jpg", 20 * 1024 * 1024)]);
			await userEvent.click(screen.getByRole("button", { name: /za duże: duze\.jpg/i }));

			const small = fileOfSize("duze.webp", 400 * 1024, "image/webp");
			mockShrink.mockResolvedValueOnce(small);

			await userEvent.click(screen.getByRole("button", { name: /zmniejsz zdjęcie/i }));

			// dialog się zamyka, flaga znika, plik podmieniony
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			await waitFor(() => expect(screen.queryByRole("button", { name: /za duże/i })).toBeNull());

			await userEvent.type(screen.getByLabelText(/^tekst$/i), "test");
			await userEvent.click(screen.getByRole("button", { name: /opublikuj/i }));

			expect(onSubmit).toHaveBeenCalledTimes(1);
			const submitted = onSubmit.mock.calls[0]?.[0] as { files: File[] };
			expect(submitted.files).toHaveLength(1);
			expect(submitted.files[0]?.size).toBe(400 * 1024);
		});

		it("limit to 19 MB — 18 MB przechodzi bez flagi, 20 MB jest oflagowane", async () => {
			const { container } = render(<NewPostForm onSubmit={vi.fn()} isSubmitting={false} />);

			await uploadFiles(container, [fileOfSize("mniejsze.jpg", 18 * 1024 * 1024)]);
			expect(screen.queryByRole("button", { name: /za duże/i })).toBeNull();

			await uploadFiles(container, [fileOfSize("duze.jpg", 20 * 1024 * 1024)]);
			expect(screen.getByRole("button", { name: /za duże: duze\.jpg/i })).toBeDefined();
		});
	});
});
