// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { PostDescriptionField } from "./post-description-field";

// MDXEditor to ciężka liba 3rd-party — mockujemy ją na granicy systemu.
// Testujemy nasz wrapper (zawsze WYSIWYG), nie wnętrze liby.
vi.mock("@mdxeditor/editor", () => ({
	MDXEditor: ({ markdown }: { markdown: string }) => (
		<div data-testid="mdx-editor" data-markdown={markdown} />
	),
	// Pluginy to czarna skrzynka dla tego testu — zwracamy obiekt.
	markdownShortcutPlugin: () => ({}),
	headingsPlugin: () => ({}),
	listsPlugin: () => ({}),
	linkPlugin: () => ({}),
	linkDialogPlugin: () => ({}),
	quotePlugin: () => ({}),
	tablePlugin: () => ({}),
	toolbarPlugin: () => ({}),
	// Komponenty toolbara — no-op (testujemy wrapper, nie toolbar).
	UndoRedo: () => null,
	BoldItalicUnderlineToggles: () => null,
	StrikeThroughSupSubToggles: () => null,
	BlockTypeSelect: () => null,
	ListsToggle: () => null,
	CreateLink: () => null,
	InsertTable: () => null,
	Separator: () => null,
}));

describe("PostDescriptionField — reviza #187 (formatowanie zawsze włączone)", () => {
	it("ZAWSZE renderuje edytor WYSIWYG — bez switcha formatowania", async () => {
		render(<PostDescriptionField value="hello" onChange={vi.fn()} />);

		expect(await screen.findByTestId("mdx-editor")).toBeDefined();
		expect(screen.queryByRole("switch")).toBeNull();
	});

	it("edytor jest uncontrolled — markdown stabilny między rerenderami (reviza #187)", async () => {
		const { rerender } = render(<PostDescriptionField value="a" onChange={vi.fn()} />);
		expect(await screen.findByTestId("mdx-editor")).toBeDefined();

		// Zmiana value z zewnątrz NIE przechodzi przez prop markdown — sync
		// idzie przez setMarkdown (editorApi); prop zostaje początkowy.
		rerender(<PostDescriptionField value="dwie linie" onChange={vi.fn()} />);
		expect(screen.getByTestId("mdx-editor").getAttribute("data-markdown")).toBe("a");
	});
});
