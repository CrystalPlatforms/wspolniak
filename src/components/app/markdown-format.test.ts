// SPDX-License-Identifier: AGPL-3.0-or-later
import { applyMarkdown } from "./markdown-format";

describe("applyMarkdown", () => {
	describe("bold", () => {
		it("wraps a selection in ** and leaves selection on the inner text", () => {
			const result = applyMarkdown({ value: "foo", selectionStart: 0, selectionEnd: 3 }, "bold");
			expect(result.value).toBe("**foo**");
			expect(result.selectionStart).toBe(2);
			expect(result.selectionEnd).toBe(5);
		});

		it("inserts empty ** with the cursor between them when nothing is selected", () => {
			const result = applyMarkdown({ value: "", selectionStart: 0, selectionEnd: 0 }, "bold");
			expect(result.value).toBe("****");
			expect(result.selectionStart).toBe(2);
			expect(result.selectionEnd).toBe(2);
		});

		it("removes ** when the selection is already bold (toggle off)", () => {
			const result = applyMarkdown(
				{ value: "**foo**", selectionStart: 0, selectionEnd: 7 },
				"bold",
			);
			expect(result.value).toBe("foo");
			expect(result.selectionStart).toBe(0);
			expect(result.selectionEnd).toBe(3);
		});
	});

	describe("italic", () => {
		it("wraps a selection in * and leaves selection on the inner text", () => {
			const result = applyMarkdown({ value: "foo", selectionStart: 0, selectionEnd: 3 }, "italic");
			expect(result.value).toBe("*foo*");
			expect(result.selectionStart).toBe(1);
			expect(result.selectionEnd).toBe(4);
		});

		it("inserts empty * with the cursor between them when nothing is selected", () => {
			const result = applyMarkdown({ value: "", selectionStart: 0, selectionEnd: 0 }, "italic");
			expect(result.value).toBe("**");
			expect(result.selectionStart).toBe(1);
			expect(result.selectionEnd).toBe(1);
		});

		it("removes * when the selection is already italic (toggle off)", () => {
			const result = applyMarkdown(
				{ value: "*foo*", selectionStart: 0, selectionEnd: 5 },
				"italic",
			);
			expect(result.value).toBe("foo");
			expect(result.selectionStart).toBe(0);
			expect(result.selectionEnd).toBe(3);
		});
	});

	describe("strikethrough", () => {
		it("wraps a selection in ~~ and leaves selection on the inner text", () => {
			const result = applyMarkdown(
				{ value: "foo", selectionStart: 0, selectionEnd: 3 },
				"strikethrough",
			);
			expect(result.value).toBe("~~foo~~");
			expect(result.selectionStart).toBe(2);
			expect(result.selectionEnd).toBe(5);
		});

		it("inserts empty ~~ with the cursor between them when nothing is selected", () => {
			const result = applyMarkdown(
				{ value: "", selectionStart: 0, selectionEnd: 0 },
				"strikethrough",
			);
			expect(result.value).toBe("~~~~");
			expect(result.selectionStart).toBe(2);
			expect(result.selectionEnd).toBe(2);
		});

		it("removes ~~ when the selection is already struck through (toggle off)", () => {
			const result = applyMarkdown(
				{ value: "~~foo~~", selectionStart: 0, selectionEnd: 8 },
				"strikethrough",
			);
			expect(result.value).toBe("foo");
			expect(result.selectionStart).toBe(0);
			expect(result.selectionEnd).toBe(3);
		});
	});

	describe("with surrounding text", () => {
		it("wraps a mid-string selection and preserves the text around it", () => {
			const result = applyMarkdown(
				{ value: "hello world", selectionStart: 6, selectionEnd: 11 },
				"bold",
			);
			expect(result.value).toBe("hello **world**");
			expect(result.selectionStart).toBe(8);
			expect(result.selectionEnd).toBe(13);
		});

		it("inserts markers at the cursor without disturbing the rest", () => {
			const result = applyMarkdown(
				{ value: "hello world", selectionStart: 5, selectionEnd: 5 },
				"italic",
			);
			expect(result.value).toBe("hello** world");
			expect(result.selectionStart).toBe(6);
			expect(result.selectionEnd).toBe(6);
		});
	});

	describe("h2", () => {
		it("prefixes a selected line with ## and selects the new line", () => {
			const result = applyMarkdown({ value: "foo", selectionStart: 0, selectionEnd: 3 }, "h2");
			expect(result.value).toBe("## foo");
			expect(result.selectionStart).toBe(0);
			expect(result.selectionEnd).toBe(6);
		});

		it("removes ## when the line is already a heading (toggle off)", () => {
			const result = applyMarkdown({ value: "## foo", selectionStart: 0, selectionEnd: 6 }, "h2");
			expect(result.value).toBe("foo");
			expect(result.selectionStart).toBe(0);
			expect(result.selectionEnd).toBe(3);
		});

		it("prefixes the whole line when only part of it is selected", () => {
			const result = applyMarkdown(
				{ value: "hello world", selectionStart: 6, selectionEnd: 11 },
				"h2",
			);
			expect(result.value).toBe("## hello world");
			expect(result.selectionStart).toBe(0);
			expect(result.selectionEnd).toBe(14);
		});
	});

	describe("h3", () => {
		it("prefixes a selected line with ### (toggle)", () => {
			const result = applyMarkdown({ value: "foo", selectionStart: 0, selectionEnd: 3 }, "h3");
			expect(result.value).toBe("### foo");
			expect(result.selectionStart).toBe(0);
			expect(result.selectionEnd).toBe(7);
		});

		it("removes ### when the line is already a subheading (toggle off)", () => {
			const result = applyMarkdown({ value: "### foo", selectionStart: 0, selectionEnd: 7 }, "h3");
			expect(result.value).toBe("foo");
		});
	});

	describe("bullet", () => {
		it("prefixes a selected line with - (toggle)", () => {
			const result = applyMarkdown({ value: "foo", selectionStart: 0, selectionEnd: 3 }, "bullet");
			expect(result.value).toBe("- foo");
			expect(result.selectionStart).toBe(0);
			expect(result.selectionEnd).toBe(5);
		});

		it("removes - when the line is already a bullet (toggle off)", () => {
			const result = applyMarkdown(
				{ value: "- foo", selectionStart: 0, selectionEnd: 5 },
				"bullet",
			);
			expect(result.value).toBe("foo");
		});

		it("prefixes every selected line when several are selected", () => {
			const result = applyMarkdown({ value: "a\nb", selectionStart: 0, selectionEnd: 3 }, "bullet");
			expect(result.value).toBe("- a\n- b");
			expect(result.selectionStart).toBe(0);
			expect(result.selectionEnd).toBe(7);
		});
	});

	describe("ordered", () => {
		it("prefixes a selected line with 1. (toggle)", () => {
			const result = applyMarkdown({ value: "foo", selectionStart: 0, selectionEnd: 3 }, "ordered");
			expect(result.value).toBe("1. foo");
			expect(result.selectionStart).toBe(0);
			expect(result.selectionEnd).toBe(6);
		});

		it("removes the number when the line is already numbered (toggle off)", () => {
			const result = applyMarkdown(
				{ value: "1. foo", selectionStart: 0, selectionEnd: 6 },
				"ordered",
			);
			expect(result.value).toBe("foo");
		});

		it("numbers every selected line sequentially (1. 2. 3.)", () => {
			const result = applyMarkdown(
				{ value: "a\nb\nc", selectionStart: 0, selectionEnd: 5 },
				"ordered",
			);
			expect(result.value).toBe("1. a\n2. b\n3. c");
			expect(result.selectionStart).toBe(0);
			expect(result.selectionEnd).toBe(14);
		});
	});

	describe("link", () => {
		it("wraps a selection as [selection](https://) and selects the URL placeholder", () => {
			const result = applyMarkdown({ value: "foo", selectionStart: 0, selectionEnd: 3 }, "link");
			expect(result.value).toBe("[foo](https://)");
			expect(result.selectionStart).toBe(6);
			expect(result.selectionEnd).toBe(14);
		});

		it("inserts [](https://) and selects the URL placeholder when nothing is selected", () => {
			const result = applyMarkdown({ value: "", selectionStart: 0, selectionEnd: 0 }, "link");
			expect(result.value).toBe("[](https://)");
			expect(result.selectionStart).toBe(3);
			expect(result.selectionEnd).toBe(11);
		});
	});
});
