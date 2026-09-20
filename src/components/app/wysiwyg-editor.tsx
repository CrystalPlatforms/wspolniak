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
	type MDXEditorMethods,
	markdownShortcutPlugin,
	quotePlugin,
	Separator,
	StrikeThroughSupSubToggles,
	tablePlugin,
	toolbarPlugin,
	UndoRedo,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { type MemberOption, MentionDropdown } from "./mention-dropdown";
import type { Mention } from "./mention-input";
import { detectMentionQuery, type MentionDetection } from "./mentions-text";

interface WysiwygEditorProps {
	value: string;
	onChange: (markdown: string) => void;
	/** Reviza #187: lista wspomnień dodanych w edytorze (jak w MentionInput). */
	onMentionsChange?: (mentions: Mention[]) => void;
	placeholder?: string;
}

/**
 * Strzałki w dół/górę przesuwają aktywną pozycję dropdownu (z przechwyceniem
 * zdarzenia, by Lexical nie przewijał treści).
 */
interface DropdownKeyEvent {
	key: string;
	preventDefault(): void;
	stopPropagation(): void;
}

function moveActive(
	event: DropdownKeyEvent,
	usersCount: number,
	setActiveIndex: (updater: (index: number) => number) => void,
) {
	if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
	event.preventDefault();
	event.stopPropagation();
	setActiveIndex((i) =>
		event.key === "ArrowDown" ? (i + 1) % usersCount : (i - 1 + usersCount) % usersCount,
	);
}

/** Cache członków instancji — jeden fetch na sesję przeglądarki (reviza #187). */
let membersCache: MemberOption[] | null = null;
let membersPromise: Promise<MemberOption[]> | null = null;

function fetchMembers(): Promise<MemberOption[]> {
	if (membersCache) return Promise.resolve(membersCache);
	if (!membersPromise) {
		membersPromise = fetch("/api/app/users")
			.then(async (r) => {
				if (!r.ok) return [];
				const json = (await r.json()) as { data?: MemberOption[] };
				return json.data ?? [];
			})
			.then((data) => {
				membersCache = data;
				return data;
			})
			.catch(() => []);
	}
	return membersPromise;
}

/**
 * Tekst przed karetą w bieżącym węźle tekstowym + prostokąt karety w
 * viewportcie. null gdy zaznaczenie nie jest karetką wewnątrz edytora.
 */
function selectionInfo(root: HTMLElement | null): { before: string; rect: DOMRect } | null {
	const selection = typeof window === "undefined" ? null : window.getSelection();
	if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
	const node = selection.anchorNode;
	if (!node || node.nodeType !== Node.TEXT_NODE) return null;
	if (!root || !root.contains(node)) return null;
	const offset = selection.anchorOffset;
	const before = (node.textContent ?? "").slice(0, offset);
	const range = selection.getRangeAt(0).cloneRange();
	const rect = range.getBoundingClientRect();
	return { before, rect };
}

/**
 * Izolowany MDXEditor (memo): propsy są stabilne przez cały czas życia
 * komponentu — re-rendery wrappera (ruchy dropdownu @mention) nie dotykają
 * ciężkiego edytora (reviza #187: zacięcia przy pisaniu).
 */
const EditorPart = memo(function EditorPart({
	markdown,
	placeholder,
	editorRef,
	onChangeRef,
}: {
	markdown: string;
	placeholder: string;
	editorRef: React.Ref<MDXEditorMethods>;
	onChangeRef: React.RefObject<(markdown: string) => void>;
}) {
	const plugins = useMemo(
		() => [
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
		],
		[],
	);
	return (
		<MDXEditor
			ref={editorRef}
			markdown={markdown}
			onChange={(md) => onChangeRef.current?.(md)}
			placeholder={placeholder}
			plugins={plugins}
			contentEditableClassName="min-h-36 px-3 py-2 text-foreground"
		/>
	);
});

/**
 * Edytor WYSIWYG na markdownie (deep module, leniwie ładowany).
 *
 * Mały interface (value / onChange) ukrywa całą konfigurację MDXEditora.
 * Źródłem prawdy jest Markdown: edytor serializuje treść przez onChange, a
 * zmiana `value` SPOZA edytorem (np. wynik AL „Popraw opis") wraca do edytora
 * przez setMarkdown (reviza #187 — bez tego MDXEditor ignorowałby nowy prop).
 *
 * Reviza #187: formatowanie zawsze dostępne (bez switcha, każde urządzenie),
 * z @mentions — wpisanie `@` otwiera dropdown aktywnych członków; klik/Enter
 * wstawia `@Imię` i rejestruje userId do powiadomienia (wzorzec MentionInput).
 *
 * Toolbar: cofnij/przywróć, styl/nagłówki, B/I, przekreślenie, listy, tabela,
 * link. Tokeny MDXEditora mapowane na motyw aplikacji (`.wspolniak-mdx`).
 */
export default function WysiwygEditor({
	value,
	onChange,
	onMentionsChange,
	placeholder,
}: WysiwygEditorProps) {
	const editorRef = useRef<MDXEditorMethods>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	/**
	 * Treść POCZĄTKOWA — jedyna, jaka trafia do propa `markdown`. MDXEditor
	 * musi być uncontrolled: controlled markdown (value przy każdym renderze)
	 * wywoływał re-import dokumentu przy każdej zmianie — lag w pisaniu i
	 * zjadanie nowych akapitów (Enter znikał). Zmiany rodzica (AL) wracają
	 * przez setMarkdown w efekcie poniżej.
	 */
	const initialMarkdown = useRef(value);
	/** Ostatnia treść, która wyszła Z edytora — warunek zewnętrznego syncu. */
	const lastInternal = useRef(value);
	/** Ostatnia kwerenda @ — podświetlenie resetujemy tylko przy jej zmianie. */
	const lastQueryRef = useRef<string | null>(null);
	const [detection, setDetection] = useState<MentionDetection | null>(null);
	const [caretRect, setCaretRect] = useState<DOMRect | null>(null);
	const [activeIndex, setActiveIndex] = useState(0);
	const [mentions, setMentions] = useState<Mention[]>([]);
	// Reviza #187: członkowie ładowani RAZ (cache modułu), filtr lokalny —
	// dropdown otwiera się natychmiast, bez zapytania na każdy znak.
	const [allMembers, setAllMembers] = useState<MemberOption[]>([]);
	useEffect(() => {
		let cancelled = false;
		fetchMembers().then((data) => {
			if (!cancelled) setAllMembers(data);
		});
		return () => {
			cancelled = true;
		};
	}, []);
	const users = useMemo(() => {
		const query = (detection?.query ?? "").toLowerCase();
		return allMembers.filter((m) => m.name.toLowerCase().includes(query));
	}, [allMembers, detection?.query]);

	// Zewnętrzna zmiana value (AL) → wstrzyknij do edytora.
	useEffect(() => {
		if (value !== lastInternal.current) {
			lastInternal.current = value;
			editorRef.current?.setMarkdown(value);
		}
	}, [value]);

	function updateDetection() {
		const info = selectionInfo(rootRef.current);
		const detected = info ? detectMentionQuery(info.before, info.before.length) : null;
		setDetection(detected);
		setCaretRect(detected && info ? info.rect : null);
		// Podświetlenie resetujemy TYLKO przy nowej kwerendzie — keyup po
		// strzałce nie ma prawa wracać do pierwszego wiersza (reviza #187).
		const query = detected?.query ?? null;
		if (query !== lastQueryRef.current) {
			lastQueryRef.current = query;
			setActiveIndex(0);
		}
	}

	function selectUser(user: MemberOption) {
		if (!detection) return;
		// Wstawienie PRZEZ MARKDOWN (getMarkdown → zamiana kwerendy → setMarkdown):
		// bezpośrednie podmiany DOM nie przechodzą przez Lexical i znikają.
		// lastIndexOf — kwerenda przy karecie (user zwykle pisze na końcu).
		const current = editorRef.current?.getMarkdown() ?? "";
		const needle = `@${detection.query}`;
		const at = current.lastIndexOf(needle);
		if (at === -1) {
			setDetection(null);
			setCaretRect(null);
			return;
		}
		const next = `${current.slice(0, at)}@${user.name} ${current.slice(at + needle.length)}`;
		lastInternal.current = next;
		editorRef.current?.setMarkdown(next);
		onChange(next);
		const nextMentions = [...mentions, { userId: user.id, name: user.name }];
		setMentions(nextMentions);
		onMentionsChange?.(nextMentions);
		setDetection(null);
		setCaretRect(null);
	}

	function handleKeyDownCapture(event: DropdownKeyEvent) {
		if (!detection || users.length === 0) return;
		if (event.key === "Escape") {
			setDetection(null);
			setCaretRect(null);
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			event.stopPropagation();
			const target = users[activeIndex];
			if (target) selectUser(target);
			return;
		}
		moveActive(event, users.length, setActiveIndex);
	}

	// Żywy callback dla memo-izolowanego edytora (bez re-renderów).
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	// Nasłuchujemy natywnie w fazie capture (zamiast propsów JSX) — kontener
	// otacza edytor 3rd-party, sam nie jest interaktywny (a11y).
	// DETEKCJA na selectionchange (document): Lexical nie zawsze emituje
	// `input` (np. sam znak @, Backspace do @), a kareta zmienia się ZAWSZE —
	// dropdown reaguje więc natychmiast, również dla pustej kwerendy.
	const handlersRef = useRef({ updateDetection, handleKeyDownCapture });
	handlersRef.current = { updateDetection, handleKeyDownCapture };
	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const hide = () => {
			setDetection(null);
			setCaretRect(null);
		};
		const onInput = () => handlersRef.current.updateDetection();
		const onKey = (event: KeyboardEvent) => handlersRef.current.handleKeyDownCapture(event);
		const onSelection = () => handlersRef.current.updateDetection();
		root.addEventListener("input", onInput, true);
		root.addEventListener("click", onInput, true);
		root.addEventListener("keydown", onKey, true);
		root.addEventListener("blur", hide, true);
		document.addEventListener("selectionchange", onSelection);
		return () => {
			root.removeEventListener("input", onInput, true);
			root.removeEventListener("click", onInput, true);
			root.removeEventListener("keydown", onKey, true);
			root.removeEventListener("blur", hide, true);
			document.removeEventListener("selectionchange", onSelection);
		};
	}, []);

	const showDropdown = detection !== null && users.length > 0 && caretRect !== null;

	return (
		<div
			ref={rootRef}
			className="wspolniak-mdx overflow-hidden rounded-md border border-input bg-background"
		>
			<EditorPart
				markdown={initialMarkdown.current}
				placeholder={placeholder ?? "Co się wydarzyło?"}
				editorRef={editorRef}
				onChangeRef={onChangeRef}
			/>
			{showDropdown && (
				<MentionDropdown
					users={users}
					activeIndex={activeIndex}
					onHover={setActiveIndex}
					onSelect={selectUser}
					positionClassName="min-w-[220px] max-w-[320px]"
					style={{
						position: "fixed",
						top: `${caretRect.bottom + 4}px`,
						left: `${Math.max(8, Math.min(caretRect.left, window.innerWidth - 340))}px`,
						zIndex: 60,
					}}
				/>
			)}
		</div>
	);
}
