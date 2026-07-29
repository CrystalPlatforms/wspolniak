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
});
