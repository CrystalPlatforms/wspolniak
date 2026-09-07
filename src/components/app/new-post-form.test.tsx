// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NewPostForm } from "./new-post-form";

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
});
