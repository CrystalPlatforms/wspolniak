// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PostDescriptionField } from "./post-description-field";

describe("PostDescriptionField", () => {
	it("renders the textarea, formatting toolbar and Podgląd toggle in edit mode by default", () => {
		render(<PostDescriptionField value="" onChange={vi.fn()} />);

		// Edit mode: the editable textarea is mounted.
		expect(screen.getByRole("textbox")).toBeDefined();
		// Post-only formatting toolbar is present.
		expect(screen.getByRole("button", { name: /pogrubienie/i })).toBeDefined();
		// Preview toggle is available.
		expect(screen.getByRole("button", { name: /podgląd/i })).toBeDefined();
	});

	it("switches to a rendered preview when Podgląd is clicked, hiding the textarea", async () => {
		const { container } = render(<PostDescriptionField value="**hello**" onChange={vi.fn()} />);

		await userEvent.click(screen.getByRole("button", { name: /podgląd/i }));

		// Textarea is unmounted in preview mode.
		expect(screen.queryByRole("textbox")).toBeNull();
		// Preview rendered the bold Markdown.
		const strong = container.querySelector("strong");
		expect(strong).not.toBeNull();
		expect(strong?.textContent).toBe("hello");
	});

	it("returns to the editor when Edytuj is clicked, bringing the textarea back", async () => {
		render(<PostDescriptionField value="**hello**" onChange={vi.fn()} />);

		// Enter preview mode.
		await userEvent.click(screen.getByRole("button", { name: /podgląd/i }));
		expect(screen.queryByRole("textbox")).toBeNull();

		// Switch back to the editor.
		await userEvent.click(screen.getByRole("button", { name: /edytuj/i }));
		expect(screen.getByRole("textbox")).toBeDefined();
	});

	it("renders the preview from the current value, not a stale snapshot", async () => {
		function Controlled() {
			const [value, setValue] = useState("pierwotny");
			return <PostDescriptionField value={value} onChange={setValue} />;
		}
		const { container } = render(<Controlled />);

		// Edit the text, then open the preview.
		await userEvent.type(screen.getByRole("textbox"), " zmiana");
		await userEvent.click(screen.getByRole("button", { name: /podgląd/i }));

		// Preview reflects the typed text, not the initial value.
		expect(container.textContent).toContain("zmiana");
	});

	it("flows toolbar formatting into the preview", async () => {
		function Controlled() {
			const [value, setValue] = useState("hello");
			return <PostDescriptionField value={value} onChange={setValue} />;
		}
		const { container } = render(<Controlled />);

		// Select "hello" and bold it via the toolbar.
		const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
		textarea.setSelectionRange(0, 5);
		await userEvent.click(screen.getByRole("button", { name: /pogrubienie/i }));

		// Preview should render the formatted result.
		await userEvent.click(screen.getByRole("button", { name: /podgląd/i }));
		const strong = container.querySelector("strong");
		expect(strong).not.toBeNull();
		expect(strong?.textContent).toBe("hello");
	});
});
