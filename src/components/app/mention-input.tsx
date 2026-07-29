// SPDX-License-Identifier: AGPL-3.0-or-later
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { type CaretCoordinates, getCaretCoordinates } from "./caret-position";
import { detectMentionQuery, insertMention, type MentionDetection } from "./mentions-text";

export interface Mention {
	userId: string;
	name: string;
}

interface MemberOption {
	id: string;
	name: string;
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
	const listRef = useRef<HTMLUListElement>(null);

	/** Utrzymuje wewnętrzny ref i (opcjonalnie) ref parenta na tym samym węźle. */
	const setNode = useCallback(
		(node: HTMLTextAreaElement | null) => {
			textareaRef.current = node;
			if (forwardedTextareaRef) forwardedTextareaRef.current = node;
		},
		[forwardedTextareaRef],
	);
	const activeItemRef = useRef<HTMLLIElement>(null);
	const [detection, setDetection] = useState<MentionDetection | null>(null);
	const [users, setUsers] = useState<MemberOption[]>([]);
	const [activeIndex, setActiveIndex] = useState(0);
	const [mentions, setMentions] = useState<Mention[]>([]);
	const [caretCoords, setCaretCoords] = useState<CaretCoordinates | null>(null);

	const filteredUsers = currentUserId ? users.filter((u) => u.id !== currentUserId) : users;

	// Re-fetch członków gdy zmieni się aktywny query (ciąg po `@`).
	useEffect(() => {
		if (!detection) {
			setUsers([]);
			return;
		}
		let cancelled = false;
		fetch(`/api/app/users?q=${encodeURIComponent(detection.query)}`)
			.then(async (r) => {
				if (!r.ok) return [];
				const json = (await r.json()) as { data?: MemberOption[] };
				return json.data ?? [];
			})
			.then((data) => {
				if (!cancelled) {
					setUsers(data);
					setActiveIndex(0);
				}
			})
			.catch(() => {
				if (!cancelled) setUsers([]);
			});
		return () => {
			cancelled = true;
		};
	}, [detection?.query, detection]);

	function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
		const target = event.target;
		const next = target.value;
		const caret = target.selectionStart ?? next.length;
		onChange(next);
		const detected = detectMentionQuery(next, caret);
		setDetection(detected);
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

	// Utrzymuj aktywny (zaznaczony klawiaturą) wiersz dropdownu w widoku. Przewijamy SAM
	// kontener listy (scrollTop), NIE scrollIntoView — to przewiera też stronę/textarea,
	// co powoduje "nienaturalne" skoki przy wpisaniu @ i strzałkach (bug #96).
	// biome-ignore lint/correctness/useExhaustiveDependencies: celowe deps — czytamy ref.current, nie wartości z closure
	useEffect(() => {
		const list = listRef.current;
		const item = activeItemRef.current;
		if (!list || !item) return;
		const listRect = list.getBoundingClientRect();
		const itemRect = item.getBoundingClientRect();
		if (itemRect.bottom > listRect.bottom) {
			list.scrollTop += itemRect.bottom - listRect.bottom;
		} else if (itemRect.top < listRect.top) {
			list.scrollTop -= listRect.top - itemRect.top;
		}
	}, [activeIndex, showDropdown]);

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
			{showDropdown && caretCoords && (
				<ul
					ref={listRef}
					aria-label="Wspomnij osobę"
					style={{
						top: `${caretCoords.top + caretCoords.height}px`,
						left: `${caretCoords.left}px`,
					}}
					className="absolute z-50 mt-1 max-h-[200px] min-w-[220px] max-w-[320px] overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
				>
					{filteredUsers.map((user, index) => (
						<li
							key={user.id}
							ref={index === activeIndex ? activeItemRef : undefined}
							data-active={index === activeIndex}
							onMouseDown={(event) => {
								event.preventDefault();
								selectUser(user);
							}}
							onMouseEnter={() => setActiveIndex(index)}
							className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm ${
								index === activeIndex ? "bg-primary text-primary-foreground" : "text-foreground"
							}`}
						>
							<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
								{user.name.slice(0, 1).toUpperCase()}
							</span>
							<span>{user.name}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
