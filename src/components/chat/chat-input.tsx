// SPDX-License-Identifier: AGPL-3.0-or-later
import { AtSign, Paperclip, Slash } from "lucide-react";
import { useRef, useState } from "react";
import { calendarProposalTemplate } from "@/components/app/calendar-proposal";
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
import { ChatLocationForm } from "./chat-location-form";
import { ChatPollForm } from "./chat-poll-form";
import { buildLinkToken } from "./link-tokens";

/** Dane formularza /ankieta (F2 #215) — pytanie + 2–6 opcji. */
export interface ChatPollInput {
	question: string;
	options: string[];
}

/** Dane formularza /polozenie (F3 #216) — pinezka + opcjonalna etykieta. */
export interface ChatLocationInput {
	lat: number;
	lng: number;
	label?: string;
}

export interface ChatInputProps {
	value: string;
	onChange: (value: string) => void;
	/** Enter bez otwartej listy mentionów = wyślij (dotychczasowe zachowanie czatu). */
	onSend: () => void;
	/** Zapis ankiety (F2 #215) — ChatView wysyła POST; resolve = zamknij formularz. */
	onSendPoll: (input: ChatPollInput) => Promise<void>;
	/** Wysyłka ankiety w toku — blokuje przycisk formularza. */
	pollPending: boolean;
	/** Zapis lokalizacji (F3 #216) — ChatView wysyła POST; resolve = zamknij formularz. */
	onSendLocation: (input: ChatLocationInput) => Promise<void>;
	/** Wysyłka lokalizacji w toku — blokuje przycisk formularza. */
	locationPending: boolean;
	/** Pliki z wybierarki (F4 #217) — walidację i przygotowanie robi ChatView. */
	onFilesSelected?: (files: File[]) => void;
	/** Imię usera z sesji — wchodzi do szablonu „Zaproponuj datę" (/wydarzenie, #219). */
	currentUserName?: string;
	/** Id zalogowanego użytkownika — wykluczone z listy (anti self-mention UX). */
	currentUserId?: string;
	disabled?: boolean;
}

/** Maks. długość wiadomości — limit PRD czatu, egzekwowany też przez API (Zod). */
const MAX_MESSAGE_LENGTH = 200;

/**
 * Próg rozwinięcia komponera: ponad 20 znaków input rośnie do h-36 (do góry —
 * pasek stoi na dole). Mobilnie przyciski @ / spinacz chowają się i input
 * zajmuje całą szerokość; desktopowo przyciski zostają.
 */
const EXPAND_THRESHOLD = 20;

/**
 * Lista komend ukośnika (#214) — styl jak mention dropdown, NAD polem.
 * Prezentacyjna: stan (aktywny wiersz) trzyma ChatInput.
 */
function ChatCommandPicker({
	commands,
	activeIndex,
	onHover,
	onSelect,
	expanded,
}: {
	commands: ChatCommand[];
	activeIndex: number;
	onHover: (index: number) => void;
	onSelect: (command: ChatCommand) => void;
	/** Rozwinięty komponer (mobile) — pasek akcji schowany, bez odchyłek popupu. */
	expanded: boolean;
}) {
	return (
		<ul
			aria-label="Polecenia"
			className={`absolute bottom-full left-0 right-0 z-50 mb-2 max-h-[200px] overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md ${
				expanded ? "" : "max-md:-left-[148px] max-md:-right-[52px]"
			}`}
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
/** Klasy komponera wg rozwinięcia: >20 znaków → wysokość h-32 (ok. 3× normalnej;
 *  kalibrowane po HITL: 4× → 3× → 2,5× → h-32). Textarea (nie input) —
 *  tekst pisze się OD GÓRY pola; input centrował linię. `block` zdejmuje
 *  inline-owy ogon linii pod textarea (wyrównanie do przycisków w rzędzie). */
function inputClassName(expanded: boolean): string {
	const sizing = expanded ? "h-32 rounded-2xl py-3" : "h-11 rounded-full py-2.5";
	return `no-scrollbar block w-full resize-none overflow-y-auto border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground transition-[height,border-radius] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${sizing}`;
}

/** Pasek akcji (@ / / spinacz): mobilnie znika przy rozwiniętym komponerze. */
function actionClusterClassName(expanded: boolean): string {
	return `flex shrink-0 items-center gap-1 ${expanded ? "max-md:hidden" : ""}`;
}

/** Komunikat osiągnięcia limitu 200 znaków — nad polem, gdy tekst jest przycięty. */
function LimitHint({ visible }: { visible: boolean }) {
	if (!visible) return null;
	return (
		<p
			data-limit-hint
			className="absolute bottom-full left-0 right-0 mb-1 text-xs font-medium text-destructive"
		>
			Maksymalna długość wiadomości to 200 znaków
		</p>
	);
}

/**
 * Pole czatu z @mentions (#168): wpisanie `@` (na początku lub po białym znaku)
 * otwiera listę członków rodziny nad polem; ciąg po `@` filtruje na żywo.
 * Mention to czysty tekst `@imię ` — bez metadanych i powiadomień (czat nie ma
 * push; treść niesie mention sama z siebie).
 */
export function ChatInput({
	value,
	onChange,
	onSend,
	onSendPoll,
	pollPending,
	onSendLocation,
	locationPending,
	onFilesSelected,
	currentUserName,
	currentUserId,
	disabled,
}: ChatInputProps) {
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [detection, setDetection] = useState<MentionDetection | null>(null);
	const users = useMentionUsers(detection?.query ?? null);
	const [activeIndex, setActiveIndex] = useState(0);
	// Komenda: detekcja `/` (wpisywanie) albo „wymuszona" przyciskiem (query "").
	// Null = picker zamknięty. Wzajemnie wykluczona z mentionem (patrz handleChange).
	const [command, setCommand] = useState<CommandDetection | null>(null);
	const [commandIndex, setCommandIndex] = useState(0);
	// Formularze komend (#214, #215, #216): /link zapamiętuje pozycję karety do
	// wstawienia tokenu; /ankieta i /polozenie nie dotykają draftu. Null/false =
	// zamknięte. Wzajemnie wykluczone.
	const [linkCaret, setLinkCaret] = useState<number | null>(null);
	const [pollOpen, setPollOpen] = useState(false);
	const [locationOpen, setLocationOpen] = useState(false);

	const filteredUsers = currentUserId ? users.filter((u) => u.id !== currentUserId) : users;

	function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
		const target = event.target;
		onChange(target.value);
		const caret = target.selectionStart ?? target.value.length;
		const detected = detectMentionQuery(target.value, caret);
		if (detected) {
			// Mention wygrywa z komendą (reguła #168); nowy query = pierwszy wiersz.
			// Otwarte formularze komend ustępują oknu mentionów.
			setDetection(detected);
			setCommand(null);
			setLinkCaret(null);
			setPollOpen(false);
			setLocationOpen(false);
			setActiveIndex(0);
			return;
		}
		setDetection(null);
		const detectedCommand = detectCommandQuery(target.value, caret);
		if (detectedCommand) {
			// Nowy query komendy = pierwszy wiersz listy; otwarte formularze ustępują.
			setCommand(detectedCommand);
			setCommandIndex(0);
			setLinkCaret(null);
			setPollOpen(false);
			setLocationOpen(false);
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
	 * wpisuje je do pola — nie chcemy `/link` w treści) i otwiera formularz komendy.
	 * `/link` wstawia token na pozycji karety; `/ankieta` (#215) i `/polozenie`
	 * (#216) nie dotykają draftu — otwierają tylko formularz nad inputem;
	 * `/dodaj` (#217) otwiera natywną wybierarkę plików; `/wydarzenie` (#219)
	 * wstawia szablon „Zaproponuj datę" dokładnie w miejsce wpisanej komendy.
	 */
	function pickCommand(picked: ChatCommand) {
		// Wpisana treść `/query` znika z draftu — formularz wstaje dokładnie w jej miejsce.
		const start = command?.startIndex ?? value.length;
		const end = start + 1 + (command?.query.length ?? 0);
		const cleaned = value.slice(0, start) + value.slice(end);
		onChange(cleaned);
		setCommand(null);
		if (picked.name === "/ankieta") {
			setPollOpen(true);
			return;
		}
		if (picked.name === "/polozenie") {
			setLocationOpen(true);
			return;
		}
		if (picked.name === "/dodaj") {
			openFilePicker();
			return;
		}
		if (picked.name === "/wydarzenie") {
			// Szablon z JEDNEGO źródła z przyciskiem kalendarza. Input czatu jest
			// jednowierszowy — przeglądarka i tak sanitizuje wartość (wyrzuca CR/LF),
			// więc normalizujemy jawnie (spacje) i trzymamy limit 200 znaków.
			const template = calendarProposalTemplate(currentUserName ?? "")
				.replace(/\s+/g, " ")
				.trim()
				.slice(0, MAX_MESSAGE_LENGTH);
			const inserted = cleaned.slice(0, start) + template + cleaned.slice(start);
			onChange(inserted);
			const nextCaret = start + template.length;
			requestAnimationFrame(() => {
				const node = inputRef.current;
				if (!node) return;
				node.selectionStart = nextCaret;
				node.selectionEnd = nextCaret;
				node.focus();
			});
			return;
		}
		setLinkCaret(start);
	}

	/**
	 * Natywna wybierarka plików (F4 #217) — spinacz i `/dodaj` wchodzą tą samą
	 * drogą. Reset `value` pozwala wybrać ponownie ten sam plik.
	 */
	function openFilePicker() {
		const node = fileInputRef.current;
		if (!node) return;
		node.value = "";
		node.click();
	}

	/** Wybór z wybierarki: pliki lecą do ChatView (walidacja + zmniejszanie zdjęć). */
	function handleFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(event.target.files ?? []);
		if (files.length > 0) onFilesSelected?.(files);
		event.target.value = "";
	}

	/**
	 * Zapis ankiety (F2 #215): wysyłka przez ChatView; resolve = sukces → zamykamy
	 * formularz. Odrzucenie (błąd API/toast) — formularz zostaje z wpisaną treścią.
	 */
	async function sendPoll(input: ChatPollInput) {
		try {
			await onSendPoll(input);
			setPollOpen(false);
		} catch {
			// Formularz zostaje otwarty — błąd raportuje toast w ChatView.
		}
	}

	/** Zapis lokalizacji (F3 #216) — jak sendPoll: resolve zamyka, odrzucenie nie. */
	async function sendLocation(input: ChatLocationInput) {
		try {
			await onSendLocation(input);
			setLocationOpen(false);
		} catch {
			// Formularz zostaje otwarty — błąd raportuje toast w ChatView.
		}
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
	function navigateDropdown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
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

	function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key === "Escape") {
			// Escape zamyka najpierw picker komend, potem listę mentionów.
			closePickersOnEscape(event);
			return;
		}
		// Enter = wyślij (jak dotychczas); Shift+Enter wstawia nową linię —
		// komponer to textarea (tekst od góry przy rozwinięciu), bąbelki
		// renderują wieloliniowy tekst (whitespace-pre-wrap).
		if (event.key === "Enter" && !event.shiftKey) {
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
	function closePickersOnEscape(event: React.KeyboardEvent<HTMLTextAreaElement>) {
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
	function navigateCommandDropdown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
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
	// Rozwinięty komponer (długia wiadomość): mobilnie chowamy pasek akcji,
	// input rośnie 4× — popupy tracą wtedy mobilne odchyłki za przyciskami.
	const expanded = value.length > EXPAND_THRESHOLD;
	const popupOffsets = expanded ? "" : "max-md:-left-[148px] max-md:-right-[52px]";

	return (
		// flex-1: root rozpycha się w rzędzie formularza (input pełnej szerokości
		// jak przed #214) — bez tego zapada się do szerokości treści.
		<div className="flex flex-1 items-center gap-2">
			{/* Pasek komend (#214): @, / i spinacz (#217) — okrągłe przyciski po lewej inputu.
			    Mobilnie chowają się przy rozwiniętym komponerze (>20 znaków) — input
			    rozciąga się na ich miejsce; desktopowo zostają. */}
			<div className={actionClusterClassName(expanded)}>
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
				<button
					type="button"
					aria-label="Załącz pliki"
					onClick={openFilePicker}
					className="flex size-11 shrink-0 items-center justify-center rounded-full border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<Paperclip className="size-5" />
				</button>
				{/* Natywna wybierarka (F4 #217) — otwierana programowo; wielokrotny wybór,
				    bez `accept`: każdy typ poza wideo (video odcina walidacja z komunikatem). */}
				<input
					ref={fileInputRef}
					type="file"
					multiple
					hidden
					onChange={handleFilesChange}
					aria-hidden="true"
					tabIndex={-1}
				/>
			</div>
			<div className="relative flex-1">
				<LimitHint visible={value.length >= MAX_MESSAGE_LENGTH} />
				<textarea
					ref={inputRef}
					value={value}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					maxLength={MAX_MESSAGE_LENGTH}
					placeholder="Wiadomość…"
					aria-label="Wiadomość"
					autoComplete="off"
					disabled={disabled}
					/* Textarea: tekst od góry pola; rozwinięcie 4× rośnie DO GÓRY (pasek
					   stoi na dole); treść przewija się, gdy przekroczy wysokość. */
					className={inputClassName(expanded)}
				/>
				{showCommandPicker && (
					<ChatCommandPicker
						commands={filteredCommands}
						activeIndex={commandIndex}
						onHover={setCommandIndex}
						onSelect={pickCommand}
						expanded={expanded}
					/>
				)}
				{pollOpen || locationOpen || linkCaret !== null ? (
					/* Mobilnie: okno na szerokość od przycisku @ do przycisku wyślij
					   (odchyłki znikają, gdy pasek akcji jest schowany — rozwinięty input). */
					<div className={`absolute bottom-full left-0 right-0 mb-2 ${popupOffsets}`}>
						{pollOpen ? (
							<ChatPollForm
								onSave={sendPoll}
								onCancel={() => setPollOpen(false)}
								pending={pollPending}
							/>
						) : locationOpen ? (
							<ChatLocationForm
								onSave={sendLocation}
								onCancel={() => setLocationOpen(false)}
								pending={locationPending}
							/>
						) : (
							<ChatLinkForm onSave={saveLink} onCancel={() => setLinkCaret(null)} />
						)}
					</div>
				) : null}
				{showDropdown && (
					<MentionDropdown
						users={filteredUsers}
						activeIndex={activeIndex}
						onHover={setActiveIndex}
						onSelect={selectUser}
						// Czat stoi na dole ekranu — lista NAD polem, pełna jego szerokość.
						positionClassName={`bottom-full left-0 right-0 mb-2 ${popupOffsets}`}
					/>
				)}
			</div>
		</div>
	);
}
