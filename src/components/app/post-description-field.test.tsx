// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostDescriptionField } from "./post-description-field";

// Środowisko (desktop vs mobile/PWA) kontrolowane per-test — domyślnie desktop,
// bo istniejące testy zakładają, że switch formatowania jest dostępny.
const richTextEnv = vi.hoisted(() => ({ supports: true }));
vi.mock("@/hooks/use-supports-rich-text", () => ({
	useSupportsRichText: () => richTextEnv.supports,
}));

// MDXEditor to ciężka liba 3rd-party — mockujemy ją na granicy systemu.
// Testujemy nasz wrapper (switch → lazy → edytor), nie wnętrze liby.
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
	// Komponenty toolbara — no-op (testujemy switch → lazy → edytor, nie toolbar).
	UndoRedo: () => null,
	BoldItalicUnderlineToggles: () => null,
	StrikeThroughSupSubToggles: () => null,
	BlockTypeSelect: () => null,
	ListsToggle: () => null,
	CreateLink: () => null,
	InsertTable: () => null,
	Separator: () => null,
}));

describe("PostDescriptionField", () => {
	it("renderuje zwykłe pole tekstowe i switch formatowania, gdy markdown włączony (domyślnie OFF)", () => {
		render(<PostDescriptionField value="" onChange={vi.fn()} markdownEnabled />);

		// Domyślnie OFF → zwykłe pole tekstowe, edytor WYSIWYG niewidoczny.
		expect(screen.getByRole("textbox")).toBeDefined();
		expect(screen.queryByTestId("mdx-editor")).toBeNull();
		// Switch formatowania dostępny i wyłączony.
		const toggle = screen.getByRole("switch", { name: /formatowanie/i });
		expect(toggle).toBeDefined();
		expect(toggle.getAttribute("aria-checked")).toBe("false");
	});

	it("nie renderuje switcha, gdy markdown wyłączony", () => {
		render(<PostDescriptionField value="" onChange={vi.fn()} markdownEnabled={false} />);

		expect(screen.getByRole("textbox")).toBeDefined();
		expect(screen.queryByRole("switch")).toBeNull();
		expect(screen.queryByTestId("mdx-editor")).toBeNull();
	});

	it("ładuje edytor WYSIWYG dopiero po włączeniu switcha (leniwie)", async () => {
		render(<PostDescriptionField value="hello" onChange={vi.fn()} markdownEnabled />);

		// Przed włączeniem: brak edytora (biblioteka się nie ładuje).
		expect(screen.queryByTestId("mdx-editor")).toBeNull();

		// Włączamy formatowanie.
		await userEvent.click(screen.getByRole("switch", { name: /formatowanie/i }));

		// Edytor ładuje się przez Suspense (React.lazy) — czekamy na render.
		expect(await screen.findByTestId("mdx-editor")).toBeDefined();
		// Zwykły textarea zostaje zastąpiony edytorem.
		expect(screen.queryByRole("textbox")).toBeNull();
	});

	it("nie pokazuje switcha formatowania na mobile/PWA (środowisko bez rich text)", () => {
		richTextEnv.supports = false;
		render(<PostDescriptionField value="" onChange={vi.fn()} markdownEnabled />);

		// Mimo włączonego markdown — na mobile/PWA switcha nie ma, zostaje zwykłe
		// pole tekstowe (WYSIWYG jest ciężki i nieporęczny na telefonie / w PWA).
		expect(screen.getByRole("textbox")).toBeDefined();
		expect(screen.queryByRole("switch")).toBeNull();
		expect(screen.queryByTestId("mdx-editor")).toBeNull();
		richTextEnv.supports = true;
	});
});
