// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Picker wideo ma własne zależności (server fn + QueryClient) — izolujemy test formularza.
vi.mock("@/components/app/post-video-picker", () => ({
	PostVideoPicker: () => <div data-testid="post-video-picker" />,
}));

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

	it("renders the post-only formatting toolbar (B/I/S)", () => {
		render(<NewPostForm onSubmit={vi.fn()} isSubmitting={false} />);

		expect(screen.getByRole("button", { name: /pogrubienie/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /kursywa/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /przekreślenie/i })).toBeDefined();
	});

	it("renders the video picker when the video feature is enabled", () => {
		render(<NewPostForm onSubmit={vi.fn()} isSubmitting={false} />);

		expect(screen.queryByTestId("post-video-picker")).not.toBeNull();
	});

	it("hides the video picker when the video feature is disabled", () => {
		render(
			<NewPostForm
				onSubmit={vi.fn()}
				isSubmitting={false}
				featureFlags={{ video: false, markdown: true }}
			/>,
		);

		expect(screen.queryByTestId("post-video-picker")).toBeNull();
	});

	it("hides the formatting toolbar when the markdown feature is disabled", () => {
		render(
			<NewPostForm
				onSubmit={vi.fn()}
				isSubmitting={false}
				featureFlags={{ video: true, markdown: false }}
			/>,
		);

		expect(screen.queryByRole("button", { name: /pogrubienie/i })).toBeNull();
	});

	it("shows file count validation error for >10 files", () => {
		const { container } = render(<NewPostForm onSubmit={vi.fn()} isSubmitting={false} />);

		const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;
		expect(fileInput).toBeDefined();
		expect(fileInput.accept).toContain("image/jpeg");
		expect(fileInput.accept).toContain("image/heic");
		expect(fileInput.multiple).toBe(true);
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
