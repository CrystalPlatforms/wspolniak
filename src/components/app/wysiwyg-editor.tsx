// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	BlockTypeSelect,
	BoldItalicUnderlineToggles,
	CreateLink,
	headingsPlugin,
	InsertTable,
	ListsToggle,
	linkDialogPlugin,
	linkPlugin,
	listsPlugin,
	MDXEditor,
	markdownShortcutPlugin,
	quotePlugin,
	Separator,
	StrikeThroughSupSubToggles,
	tablePlugin,
	toolbarPlugin,
	UndoRedo,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

interface WysiwygEditorProps {
	value: string;
	onChange: (markdown: string) => void;
}

/**
 * Edytor WYSIWYG na markdownie (deep module, leniwie ładowany).
 *
 * Mały interface (value / onChange) ukrywa całą konfigurację MDXEditora.
 * Źródłem prawdy jest Markdown: wciśnięcie „B" formatuje tekst na żywo, a edytor
 * serializuje go z powrotem do markdowna przez onChange. Ponieważ ten plik ładowany
 * jest przez `React.lazy` w {@link PostDescriptionField}, trafia do osobnego chunka
 * razem ze stylami — strona bez włączonego formatowania nie pobiera biblioteki ani CSS-u.
 *
 * Toolbar odpowiada dawnemu zestawowi formatowania powiększonemu o akcje znane
 * z edytorów tekstu: cofnij/przywróć (↶↷), styl/nagłówki, pogrubienie, pochylenie,
 * przekreślenie, listy, tabela i link — „jak w Wordzie". Aktywny przycisk ma zielone
 * obramowanie zamiast wypełnienia, a tokeny MDXEditora są mapowane na zmienne motywu
 * aplikacji, więc całość (w tym dropdown stylu) adaptuje się do light/dark
 * (patrz `.wspolniak-mdx` w styles.css).
 */
export default function WysiwygEditor({ value, onChange }: WysiwygEditorProps) {
	return (
		<div className="wspolniak-mdx overflow-hidden rounded-md border border-input bg-background">
			<MDXEditor
				markdown={value}
				onChange={(markdown) => onChange(markdown)}
				placeholder="Co się wydarzyło?"
				plugins={[
					headingsPlugin(),
					listsPlugin(),
					linkPlugin(),
					linkDialogPlugin(),
					quotePlugin(),
					tablePlugin(),
					markdownShortcutPlugin(),
					toolbarPlugin({
						toolbarContents: () => (
							<>
								<UndoRedo />
								<Separator />
								<BlockTypeSelect />
								<Separator />
								{/* Ograniczone do B i I — bez underline (U). Markdown nie ma składni
								    podkreślenia, więc MDXEditor zapisywałby je jako HTML <u>, który
								    w opublikowanym poście wyświetlałby się jako dosłowny tekst. */}
								<BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
								<StrikeThroughSupSubToggles options={["Strikethrough"]} />
								<Separator />
								{/* Opcje ograniczone do wypunktowania i numeracji — bez checklisty
								    (domyślnie ListsToggle renderuje też przycisk „check", którego nie chcemy). */}
								<ListsToggle options={["bullet", "number"]} />
								<InsertTable />
								<Separator />
								<CreateLink />
							</>
						),
					}),
				]}
				contentEditableClassName="min-h-36 px-3 py-2 text-foreground"
			/>
		</div>
	);
}
