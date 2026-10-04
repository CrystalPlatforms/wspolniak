// SPDX-License-Identifier: AGPL-3.0-or-later
import { AtSign, Slash } from "lucide-react";
import { useRef, useState } from "react";
import {
	type MemberOption,
	MentionDropdown,
	useMentionUsers,
} from "@/components/app/mention-dropdown";
import {
	detectMentionQuery,
	insertMention,
	type MentionDetection,
} from "@/components/app/mentions-text";
import {
	type ChatCommand,
	type CommandDetection,
	detectCommandQuery,
	filterCommands,
} from "./chat-commands";
import { ChatLinkForm } from "./chat-link-form";
import { buildLinkToken } from "./link-tokens";

export interface ChatInputProps {
	value: string;
	onChange: (value: string) => void;
	/** Enter bez otwartej listy mentionów = wyślij (dotychczasowe zachowanie czatu). */
	onSend: () => void;
	/** Id zalogowanego użytkownika — wykluczone z listy (anti self-mention UX). */
	currentUserId?: string;
	disabled?: boolean;
}

/** Maks. długość wiadomości — limit PRD czatu, egzekwowany też przez API (Zod). */
const MAX_MESSAGE_LENGTH = 200;

/**
 * Lista komend ukośnika (#214) — styl jak mention dropdown, NAD polem.
 * Prezentacyjna: stan (aktywny wiersz) trzyma ChatInput.
 */
function ChatCommandPicker({
	commands,
	activeIndex,
	onHover,
	onSelect,
}: {
	commands: ChatCommand[];
	activeIndex: number;
	onHover: (index: number) => void;
	onSelect: (command: ChatCommand) => void;
}) {
	return (
		<ul
			aria-label="Polecenia"
			className="absolute z-50 max-h-[200px] overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md bottom-full left-0 right-0 mb-2 max-md:-left-[100px] max-md:-right-[52px]"
		>
			{commands.map((command, index) => (
				<li
					key={command.name}
					data-active={index === activeIndex}
					onMouseDown={(event) => {
						event.preventDefault();
						onSelect(command);
					}}
					onMouseEnter={() => onHover(index)}
					className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm ${
						index === activeIndex ? "bg-primary text-primary-foreground" : "text-foreground"
					}`}
				>
					<span className="font-medium">{command.name}</span>
					<span className="text-xs text-muted-foreground">{command.description}</span>
				</li>
			))}
		</ul>
	);
}
/**
 * Pole czatu z @mentions (#168): wpisanie `@` (na początku lub po białym znaku)
 * otwiera listę członków rodziny nad polem; ciąg po `@` filtruje na żywo.
 * Mention to czysty tekst `@imię ` — bez metadanych i powiadomień (czat nie ma
 * push; treść niesie mention sama z siebie).
 */
export function ChatInput({ value, onChange, onSend, currentUserId, disabled }: ChatInputProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [detection, setDetection] = useState<MentionDetection | null>(null);
	const users = useMentionUsers(detection?.query ?? null);
	const [activeIndex, setActiveIndex] = useState(0);
	// Komenda: detekcja `/` (wpisywanie) albo „wymuszona" przyciskiem (query "").
	// Null = picker zamknięty. Wzajemnie wykluczona z mentionem (patrz handleChange).
	const [command, setCommand] = useState<CommandDetection | null>(null);
	const [commandIndex, setCommandIndex] = useState(0);
	// Formularz /link: zapamiętana pozycja karety do wstawienia tokenu; null = zamknięty.
	const [linkCaret, setLinkCaret] = useState<number | null>(null);

	const filteredUsers = currentUserId ? users.filter((u) => u.id !== currentUserId) : users;

	function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
		const target = event.target;
		onChange(target.value);
		const caret = target.selectionStart ?? target.value.length;
		const detected = detectMentionQuery(target.value, caret);
		if (detected) {
			// Mention wygrywa z komendą (reguła #168); nowy query = pierwszy wiersz.
			// Otwarty formularz /link ustępuje oknu mentionów.
			setDetection(detected);
			setCommand(null);
			setLinkCaret(null);
			setActiveIndex(0);
			return;
		}
		setDetection(null);
		const detectedCommand = detectCommandQuery(target.value, caret);
		if (detectedCommand) {
			// Nowy query komendy = pierwszy wiersz listy; formularz /link ustępuje.
			setCommand(detectedCommand);
			setCommandIndex(0);
			setLinkCaret(null);
		} else {
			setCommand(null);
		}
	}

	/**
	 * Przycisk @: wstawia `@` na karecie (ze spacją, gdy w środku słowa — inaczej
	 * detekcja #168 by go nie złapała) i otwiera listę członków.
	 */
	function insertAtButton() {
		const el = inputRef.current;
		const caret = el?.selectionStart ?? value.length;
		const needsSpace = caret > 0 && !/\s/.test(value[caret - 1] ?? "");
		const insert = needsSpace ? " @" : "@";
		const text = value.slice(0, caret) + insert + value.slice(caret);
		onChange(text);
		setCommand(null);
		setDetection(detectMentionQuery(text, caret + insert.length));
		setActiveIndex(0);
		const nextCaret = caret + insert.length;
		requestAnimationFrame(() => {
			const node = inputRef.current;
			if (!node) return;
			node.selectionStart = nextCaret;
			node.selectionEnd = nextCaret;
			node.focus();
		});
	}

	/**
	 * Przycisk /: wstawia `/` na karecie (ze spacją, gdy w środku słowa — jak @)
	 * i otwiera picker komend z detekcji — klik działa jak wpisanie.
	 */
	function insertSlashButton() {
		const el = inputRef.current;
		const caret = el?.selectionStart ?? value.length;
		const needsSpace = caret > 0 && !/\s/.test(value[caret - 1] ?? "");
		const insert = needsSpace ? " /" : "/";
		const text = value.slice(0, caret) + insert + value.slice(caret);
		onChange(text);
		setDetection(null);
		setCommand(detectCommandQuery(text, caret + insert.length));
		setCommandIndex(0);
		const nextCaret = caret + insert.length;
		requestAnimationFrame(() => {
			const node = inputRef.current;
			if (!node) return;
			node.selectionStart = nextCaret;
			node.selectionEnd = nextCaret;
			node.focus();
		});
	}

	/**
	 * Wybór komendy z pickera: czyści wpisane `/query` z draftu (Enter z klawiatury
	 * wpisuje je do pola — nie chcemy `/link` w treści) i otwiera formularz /link
	 * na pozycji karety.
	 */
	function pickCommand(_picked: ChatCommand) {
		// Wpisana treść `/query` znika z draftu — token wstaje dokładnie w jej miejsce.
		const start = command?.startIndex ?? value.length;
		const end = start + 1 + (command?.query.length ?? 0);
		onChange(value.slice(0, start) + value.slice(end));
		setCommand(null);
		setLinkCaret(start);
	}

	/** Zapis formularza /link: token wstawiony na zapamiętanej karecie formularza. */
	function saveLink(input: { title: string; url: string }) {
		const caret = linkCaret ?? value.length;
		const token = buildLinkToken(input);
		onChange(value.slice(0, caret) + token + value.slice(caret));
		setLinkCaret(null);
		const nextCaret = caret + token.length;
		requestAnimationFrame(() => {
			const node = inputRef.current;
			if (!node) return;
			node.selectionStart = nextCaret;
			node.selectionEnd = nextCaret;
			node.focus();
		});
	}

	/** Wstawia `@imię ` w miejsce query i wraca fokusem tuż za wstawioną spacją. */
	function selectUser(user: MemberOption) {
		if (!detection) return;
		const { text, caret } = insertMention(value, detection, user.name);
		onChange(text);
		setDetection(null);
		requestAnimationFrame(() => {
			const el = inputRef.current;
			if (!el) return;
			el.selectionStart = caret;
			el.selectionEnd = caret;
			el.focus();
		});
	}

	/** Strzałki przesuwają aktywny wiersz listy (jak w MentionInput). */
	function navigateDropdown(event: React.KeyboardEvent<HTMLInputElement>): void {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveIndex((i) => (i + 1) % filteredUsers.length);
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveIndex((i) => (i - 1 + filteredUsers.length) % filteredUsers.length);
		}
	}

	/** Enter: lista otwarta → wybór aktywnego wiersza; zamknięta → wyślij jak dotychczas. */
	function handleEnterKey() {
		const target = detection && filteredUsers.length > 0 ? filteredUsers[activeIndex] : undefined;
		if (target) selectUser(target);
		else onSend();
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (event.key === "Escape") {
			// Escape zamyka najpierw picker komend, potem listę mentionów.
			closePickersOnEscape(event);
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			handleEnter();
			return;
		}
		if (command && filteredCommands.length > 0) {
			navigateCommandDropdown(event);
			if (event.defaultPrevented) return;
		}
		if (!detection || filteredUsers.length === 0) return;
		navigateDropdown(event);
	}

	/** Escape zamyka najpierw picker komend, potem listę mentionów. */
	function closePickersOnEscape(event: React.KeyboardEvent<HTMLInputElement>) {
		if (command) {
			event.preventDefault();
			setCommand(null);
			return;
		}
		if (detection) {
			event.preventDefault();
			setDetection(null);
		}
	}

	/** Enter: picker komend → wybór komendy; lista mentionów → wybór; inaczej wyślij. */
	function handleEnter() {
		// Picker komend otwarty → Enter wybiera aktywną komendę (klawiatura = dotyk).
		const activeCommand =
			command && filteredCommands.length > 0 ? filteredCommands[commandIndex] : undefined;
		if (activeCommand) {
			pickCommand(activeCommand);
			return;
		}
		handleEnterKey();
	}

	/** Strzałki przesuwają aktywny wiersz pickera komend. */
	function navigateCommandDropdown(event: React.KeyboardEvent<HTMLInputElement>): void {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setCommandIndex((i) => (i + 1) % filteredCommands.length);
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setCommandIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
		}
	}

	// Komendy w pickerze dla aktywnego query — puste query (przycisk) = wszystkie.
	const filteredCommands = filterCommands(command?.query ?? "");
	const showCommandPicker = command !== null && filteredCommands.length > 0;
	const showDropdown = detection !== null && filteredUsers.length > 0;

	return (
		// flex-1: root rozpycha się w rzędzie formularza (input pełnej szerokości
		// jak przed #214) — bez tego zapada się do szerokości treści.
		<div className="flex flex-1 items-center gap-2">
			{/* Pasek komend (#214): @ i / — okrągłe przyciski po lewej inputu. */}
			<div className="flex shrink-0 items-center gap-1">
				<button
					type="button"
					aria-label="Wstaw @"
					onClick={insertAtButton}
					className="flex size-11 shrink-0 items-center justify-center rounded-full border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<AtSign className="size-5" />
				</button>
				<button
					type="button"
					aria-label="Polecenia"
					onClick={insertSlashButton}
					aria-expanded={showCommandPicker}
					className="flex size-11 shrink-0 items-center justify-center rounded-full border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<Slash className="size-5" />
				</button>
			</div>
			<div className="relative flex-1">
				<input
					ref={inputRef}
					value={value}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					maxLength={MAX_MESSAGE_LENGTH}
					placeholder="Wiadomość…"
					aria-label="Wiadomość"
					autoComplete="off"
					disabled={disabled}
					className="w-full rounded-full border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
				{showCommandPicker && (
					<ChatCommandPicker
						commands={filteredCommands}
						activeIndex={commandIndex}
						onHover={setCommandIndex}
						onSelect={pickCommand}
					/>
				)}
				{linkCaret !== null ? (
					/* Mobilnie: okno na szerokości od przycisku @ (100px w lewo) do
					   przycisku wyślij (52px w prawo). */
					<div className="absolute bottom-full left-0 right-0 mb-2 max-md:-left-[100px] max-md:-right-[52px]">
						<ChatLinkForm onSave={saveLink} onCancel={() => setLinkCaret(null)} />
					</div>
				) : null}
				{showDropdown && (
					<MentionDropdown
						users={filteredUsers}
						activeIndex={activeIndex}
						onHover={setActiveIndex}
						onSelect={selectUser}
						// Czat stoi na dole ekranu — lista NAD polem, pełna jego szerokość.
						positionClassName="bottom-full left-0 right-0 mb-2 max-md:-left-[100px] max-md:-right-[52px]"
					/>
				)}
			</div>
		</div>
	);
}
