// SPDX-License-Identifier: AGPL-3.0-or-later
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

	const filteredUsers = currentUserId ? users.filter((u) => u.id !== currentUserId) : users;

	function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
		const target = event.target;
		onChange(target.value);
		const detected = detectMentionQuery(target.value, target.selectionStart ?? target.value.length);
		setDetection(detected);
		// Nowy query = nowa lista podpowiedzi → aktywny wraca na pierwszy wiersz.
		if (detected) setActiveIndex(0);
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
			if (detection) {
				event.preventDefault();
				setDetection(null);
			}
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			handleEnterKey();
			return;
		}
		if (!detection || filteredUsers.length === 0) return;
		navigateDropdown(event);
	}

	const showDropdown = detection !== null && filteredUsers.length > 0;

	return (
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
			{showDropdown && (
				<MentionDropdown
					users={filteredUsers}
					activeIndex={activeIndex}
					onHover={setActiveIndex}
					onSelect={selectUser}
					// Czat stoi na dole ekranu — lista NAD polem, pełna jego szerokość.
					positionClassName="bottom-full left-0 right-0 mb-2"
				/>
			)}
		</div>
	);
}
