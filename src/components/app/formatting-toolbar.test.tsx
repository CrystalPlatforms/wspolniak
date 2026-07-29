// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import type { RefObject } from "react";
import { FormattingToolbar } from "./formatting-toolbar";

function makeRef(): RefObject<HTMLTextAreaElement | null> {
	return { current: null };
}

describe("FormattingToolbar", () => {
	it("renders bold, italic and strikethrough buttons", () => {
		render(<FormattingToolbar textareaRef={makeRef()} value="foo" onChange={vi.fn()} />);

		expect(screen.getByRole("button", { name: /pogrubienie/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /kursywa/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /przekreślenie/i })).toBeDefined();
	});

	it("applies bold to the textarea selection and writes the value back", () => {
		const textarea = document.createElement("textarea");
		textarea.value = "foo";
		textarea.selectionStart = 0;
		textarea.selectionEnd = 3;
		document.body.appendChild(textarea);
		const ref = { current: textarea } as RefObject<HTMLTextAreaElement | null>;

		const onChange = vi.fn();
		render(<FormattingToolbar textareaRef={ref} value="foo" onChange={onChange} />);

		screen.getByRole("button", { name: /pogrubienie/i }).click();

		expect(onChange).toHaveBeenCalledWith("**foo**");
	});
});
