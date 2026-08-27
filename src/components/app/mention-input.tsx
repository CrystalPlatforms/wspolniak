// SPDX-License-Identifier: AGPL-3.0-or-later
import { type RefObject, useCallback, useRef, useState } from "react";
import { type CaretCoordinates, getCaretCoordinates } from "./caret-position";
import { type MemberOption, MentionDropdown, useMentionUsers } from "./mention-dropdown";
import { detectMentionQuery, insertMention, type MentionDetection } from "./mentions-text";

export interface Mention {
	userId: string;
	name: string;
}

/** Maks. wysokość dropdownu (max-h-[200px] w klasach) — próg decyzji o flipie. */
const DROPDOWN_MAX_HEIGHT = 200;
/** Maks. szerokość dropdownu (max-w-[320px] w klasach) — clamp left po najgorszym przypadku. */
const DROPDOWN_MAX_WIDTH = 320;
/** Bezpieczny odstęp dropdownu od krawędzi viewportu. */
const VIEWPORT_MARGIN = 8;
/** Odstęp dropdownu od linii karety (dawniej mt-1). */
const CARET_GAP = 4;

export interface DropdownPosition {
	/** Górna krawędź (px, względem pola) — dropdown POD linią karety. */
	top?: number;
	/** Dolna krawędź (px, względem pola) — flip NAD linię karety (#162). */
	bottom?: number;
	left: number;
}

/**
 * #162: pozycja dropdownu @mention utrzymana w kadrze aplikacji. Surowe
 * współrzędne karety wypychają listę poza viewport — komentarz na dole długiego
 * posta wypada pod ekranem, kareta przy prawej krawędzi wysuwa listę za ekran
 * (PWA/desktop) i nie da się jej kliknąć. Reguły:
 * - pod karetą jest miejsce na całą listę (≥ DROPDOWN_MAX_HEIGHT) → dropdown
 *   pod karetą, jak dotychczas;
 * - brak miejsca → flip nad linię karety (kotwica `bottom`);
 * - `left` jest klamrowane, by lista o najgorszej szerokości zmieściła się
 *   między marginesami viewportu.
 * `textarea` = prostokąt pola we viewportcie; brak wymiarów → stare zachowanie.
 */
export function clampDropdownPosition(
	caret: CaretCoordinates,
	textarea: { top: number; left: number; height: number } | null,
	viewport: { width: number; height: number } | null,
): DropdownPosition {
	if (!textarea || !viewport) {
		return { top: caret.top + caret.height + CARET_GAP, left: caret.left };
	}
	const belowTop = caret.top + caret.height + CARET_GAP;
	const spaceBelow = viewport.height - textarea.top - belowTop - VIEWPORT_MARGIN;
	const left =
		Math.max(
			Math.min(textarea.left + caret.left, viewport.width - DROPDOWN_MAX_WIDTH - VIEWPORT_MARGIN),
			VIEWPORT_MARGIN,
		) - textarea.left;
	if (spaceBelow >= DROPDOWN_MAX_HEIGHT) return { top: belowTop, left };
	return { bottom: textarea.height - caret.top + CARET_GAP, left };
}

export interface MentionInputProps {
	value: string;
	onChange: (value: string) => void;
	/** Wołane przy każdej zmianie listy wspomnień (z kliknięć dropdown). */
	onMentionsChange?: (mentions: Mention[]) => void;
	/** Id zalogowanego użytkownika — wykluczone z dropdown (anti self-mention UX). */
	currentUserId?: string;
	placeholder?: string;
	maxLength?: number;
	rows?: number;
	id?: string;
	className?: string;
	/** Opcjonalny ref do wewnętrznego textarea (toolbar formatowania posta). Komentarze go nie przekazują. */
	textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

/**
 * Pole tekstowe z @mention: wpisanie `@` otwiera dropdown aktywnych członków
 * (filtr na żywo). Klik / Enter wstawia `@imię` i rejestruje userId do powiadomienia.
 * Escape / spacja zamykają dropdown.
 *
 * userId pochodzi WYŁĄCZNIE z kliknięcia — dlatego lista mentions jest jedynym
 * źródłem prawdy o powiadomieniach. Ręcznie wpisany `@imię` nie tworzy wpisu.
 */
export function MentionInput({
	value,
	onChange,
	onMentionsChange,
	currentUserId,
	placeholder,
	maxLength,
	rows = 2,
	id,
	className,
	textareaRef: forwardedTextareaRef,
}: MentionInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	/** Utrzymuje wewnętrzny ref i (opcjonalnie) ref parenta na tym samym węźle. */
	const setNode = useCallback(
		(node: HTMLTextAreaElement | null) => {
			textareaRef.current = node;
			if (forwardedTextareaRef) forwardedTextareaRef.current = node;
		},
		[forwardedTextareaRef],
	);
	const [detection, setDetection] = useState<MentionDetection | null>(null);
	const users = useMentionUsers(detection?.query ?? null);
	const [activeIndex, setActiveIndex] = useState(0);
	const [mentions, setMentions] = useState<Mention[]>([]);
	const [caretCoords, setCaretCoords] = useState<CaretCoordinates | null>(null);

	const filteredUsers = currentUserId ? users.filter((u) => u.id !== currentUserId) : users;

	function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
		const target = event.target;
		const next = target.value;
		const caret = target.selectionStart ?? next.length;
		onChange(next);
		const detected = detectMentionQuery(next, caret);
		setDetection(detected);
		// Nowy query = nowa lista podpowiedzi → aktywny wraca na pierwszy wiersz.
		if (detected) setActiveIndex(0);
		// Pozycja dropdown = przy kursorze (nie pod całym polem).
		setCaretCoords(detected ? getCaretCoordinates(target, caret) : null);
	}

	function selectUser(user: MemberOption) {
		if (!detection || !textareaRef.current) return;
		const { text, caret } = insertMention(value, detection, user.name);
		onChange(text);
		const nextMentions = [...mentions, { userId: user.id, name: user.name }];
		setMentions(nextMentions);
		onMentionsChange?.(nextMentions);
		setDetection(null);
		// Przywróć kursor tuż za wstawioną spacją i focus z powrotem na pole.
		requestAnimationFrame(() => {
			const el = textareaRef.current;
			if (!el) return;
			el.selectionStart = caret;
			el.selectionEnd = caret;
			el.focus();
		});
	}

	function navigateDropdown(event: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveIndex((i) => (i + 1) % filteredUsers.length);
			return true;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveIndex((i) => (i - 1 + filteredUsers.length) % filteredUsers.length);
			return true;
		}
		if (event.key === "Enter") {
			const target = filteredUsers[activeIndex];
			if (target) {
				event.preventDefault();
				selectUser(target);
				return true;
			}
		}
		return false;
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key === "Escape") {
			if (detection) {
				event.preventDefault();
				setDetection(null);
			}
			return;
		}
		if (!detection || filteredUsers.length === 0) return;
		navigateDropdown(event);
	}

	const showDropdown = detection !== null && filteredUsers.length > 0 && caretCoords !== null;

	// #162: pozycja dropdownu liczona na każdym renderze (świeży prostokąt pola),
	// żeby lista nigdy nie wychodziła poza kadr aplikacji.
	const dropdownPos = caretCoords
		? clampDropdownPosition(
				caretCoords,
				textareaRef.current?.getBoundingClientRect() ?? null,
				typeof window === "undefined"
					? null
					: { width: window.innerWidth, height: window.innerHeight },
			)
		: null;

	return (
		<div className="relative">
			<textarea
				ref={setNode}
				id={id}
				className={`flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className ?? ""}`}
				value={value}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
				maxLength={maxLength}
				rows={rows}
			/>
			{showDropdown && dropdownPos && (
				<MentionDropdown
					users={filteredUsers}
					activeIndex={activeIndex}
					onHover={setActiveIndex}
					onSelect={selectUser}
					positionClassName="min-w-[220px] max-w-[320px]"
					style={{
						top: dropdownPos.top !== undefined ? `${dropdownPos.top}px` : undefined,
						bottom: dropdownPos.bottom !== undefined ? `${dropdownPos.bottom}px` : undefined,
						left: `${dropdownPos.left}px`,
					}}
				/>
			)}
		</div>
	);
}
