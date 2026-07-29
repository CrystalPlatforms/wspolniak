// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { EditPostForm } from "./edit-post-form";

describe("EditPostForm", () => {
	it("renders the formatting toolbar and Podgląd toggle (write path wired for edits)", () => {
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

		expect(screen.getByRole("button", { name: /pogrubienie/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /podgląd/i })).toBeDefined();
	});

	it("shows the post Markdown source in the editable textarea (formatting preserved)", () => {
		render(
			<EditPostForm
				postId="p1"
				description="**istniejące** i *kursywa*"
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
		// Raw Markdown source is editable — no formatting is lost on edit.
		expect(textarea.value).toBe("**istniejące** i *kursywa*");
	});
});
