// SPDX-License-Identifier: AGPL-3.0-or-later
import { type CSSProperties, useEffect, useRef, useState } from "react";

export interface MemberOption {
	id: string;
	name: string;
}

/**
 * Pobiera członków instancji pod aktywny query mentionów (ciąg po `@`).
 * null = brak aktywnego mentionu → pusta lista bez zapytania. Współdzielone
 * przez pole posta/komentarza (MentionInput) i pole czatu (ChatInput, #168).
 */
export function useMentionUsers(query: string | null): MemberOption[] {
	const [users, setUsers] = useState<MemberOption[]>([]);

	useEffect(() => {
		if (query === null) {
			setUsers([]);
			return;
		}
		let cancelled = false;
		fetch(`/api/app/users?q=${encodeURIComponent(query)}`)
			.then(async (r) => {
				if (!r.ok) return [];
				const json = (await r.json()) as { data?: MemberOption[] };
				return json.data ?? [];
			})
			.then((data) => {
				if (!cancelled) setUsers(data);
			})
			.catch(() => {
				if (!cancelled) setUsers([]);
			});
		return () => {
			cancelled = true;
		};
	}, [query]);

	return users;
}

export interface MentionDropdownProps {
	/** Członkowie do pokazania — już przefiltrowani (bez zalogowanego usera). */
	users: MemberOption[];
	/** Indeks aktywnego (podświetlonego) wiersza — sterowany strzałkami. */
	activeIndex: number;
	onHover: (index: number) => void;
	onSelect: (user: MemberOption) => void;
	/** Klasy pozycjonowania listy — MentionInput: min/max szerokość przy karecie
	 *  (#162); ChatInput: nad polem, pełna szerokość (#168). */
	positionClassName: string;
	/** Pozycja w px względem pola — liczy caller (clampDropdownPosition, #162). */
	style?: CSSProperties;
}

/**
 * Wspólna lista podpowiedzi @mention: awatar z inicjałem, imię, aktywny wiersz
 * sterowany strzałkami, klik/Enter wybiera. Aktywny wiersz trzymany w widoku
 * przewijaniem SAMEGO kontenera listy — nie scrollIntoView, bo ten przewija też
 * stronę/pole (bug #96).
 */
export function MentionDropdown({
	users,
	activeIndex,
	onHover,
	onSelect,
	positionClassName,
	style,
}: MentionDropdownProps) {
	const listRef = useRef<HTMLUListElement>(null);
	const activeItemRef = useRef<HTMLLIElement>(null);

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
	}, [activeIndex, users]);

	return (
		<ul
			ref={listRef}
			aria-label="Wspomnij osobę"
			style={style}
			className={`absolute z-50 max-h-[200px] overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md ${positionClassName}`}
		>
			{users.map((user, index) => (
				<li
					key={user.id}
					ref={index === activeIndex ? activeItemRef : undefined}
					data-active={index === activeIndex}
					onMouseDown={(event) => {
						event.preventDefault();
						onSelect(user);
					}}
					onMouseEnter={() => onHover(index)}
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
	);
}
