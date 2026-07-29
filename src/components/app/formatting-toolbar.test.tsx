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

	it("renders heading, list and link buttons", () => {
		render(<FormattingToolbar textareaRef={makeRef()} value="foo" onChange={vi.fn()} />);

		expect(screen.getByRole("button", { name: /nagłówek 1/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /nagłówek 2/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /nagłówek 3/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /lista punktowana/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /lista numerowana/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /^link$/i })).toBeDefined();
	});

	it("applies h2 to the textarea selection and writes the value back", () => {
		const textarea = document.createElement("textarea");
		textarea.value = "foo";
		textarea.selectionStart = 0;
		textarea.selectionEnd = 3;
		document.body.appendChild(textarea);
		const ref = { current: textarea } as RefObject<HTMLTextAreaElement | null>;

		const onChange = vi.fn();
		render(<FormattingToolbar textareaRef={ref} value="foo" onChange={onChange} />);

		screen.getByRole("button", { name: /nagłówek 2/i }).click();

		expect(onChange).toHaveBeenCalledWith("## foo");
	});
});
