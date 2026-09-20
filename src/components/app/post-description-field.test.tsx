// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { PostDescriptionField } from "./post-description-field";

// GradientAiButton (F2 #189) czyta stan AL z react-query — testy pola
// dostarczają providera i zamykają dostęp (effective: false), żeby przycisk
// pozostał ukryty; jego zachowanie testuje gradient-ai-button.test.tsx.
vi.stubGlobal(
	"fetch",
	vi.fn().mockImplementation((url: string) => {
		if (String(url).includes("/api/ai/access")) {
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						data: { master: false, aiOptIn: false, aiBlocked: false, effective: false },
					}),
			});
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
	}),
);

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

// MDXEditor to ciężka liba 3rd-party — mockujemy ją na granicy systemu.
// Testujemy nasz wrapper (zawsze WYSIWYG + AL), nie wnętrze liby.
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
		render(<PostDescriptionField value="hello" onChange={vi.fn()} />, {
			wrapper: createWrapper(),
		});

		expect(await screen.findByTestId("mdx-editor")).toBeDefined();
		expect(screen.queryByRole("switch")).toBeNull();
	});

	it("edytor jest uncontrolled — markdown stabilny między rerenderami (reviza #187)", async () => {
		const { rerender } = render(<PostDescriptionField value="a" onChange={vi.fn()} />, {
			wrapper: createWrapper(),
		});
		expect(await screen.findByTestId("mdx-editor")).toBeDefined();

		// Zmiana value z zewnątrz NIE przechodzi przez prop markdown — sync
		// idzie przez setMarkdown (editorApi); prop zostaje początkowy.
		rerender(<PostDescriptionField value="dwie linie" onChange={vi.fn()} />);
		expect(screen.getByTestId("mdx-editor").getAttribute("data-markdown")).toBe("a");
	});

	it("proposeFile + puste pole → Zaproponuj opis; z treścią → Popraw opis (F3 #190)", async () => {
		const file = new File(["foto"], "foto.jpg", { type: "image/jpeg" });
		// ten test wymaga skutecznego dostępu do AL — nadpisuje modułowy stub
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (String(url).includes("/api/ai/access")) {
					return Promise.resolve({
						ok: true,
						json: () =>
							Promise.resolve({
								data: { master: true, aiOptIn: true, aiBlocked: false, effective: true },
							}),
					});
				}
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: { text: "Propozycja." } }),
				});
			}),
		);
		const { rerender } = render(
			<PostDescriptionField value="" onChange={vi.fn()} proposeFile={file} />,
			{
				wrapper: createWrapper(),
			},
		);
		const propose = await screen.findByRole("button", { name: /zaproponuj opis/i });
		expect(propose.hasAttribute("disabled")).toBe(false);
		const improveEmpty = screen.getByRole("button", { name: /popraw opis/i });
		expect(improveEmpty.hasAttribute("disabled")).toBe(true);
		// treść w polu → stany się odbijają: Popraw aktywny, Zaproponuj wygaszony
		rerender(<PostDescriptionField value="Już coś" onChange={vi.fn()} proposeFile={file} />);
		await vi.waitFor(() =>
			expect(
				screen.getByRole("button", { name: /zaproponuj opis/i }).hasAttribute("disabled"),
			).toBe(true),
		);
		expect(screen.getByRole("button", { name: /popraw opis/i }).hasAttribute("disabled")).toBe(
			false,
		);
	});
});
