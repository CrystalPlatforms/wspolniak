// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	IconBold,
	IconH1,
	IconH2,
	IconH3,
	IconItalic,
	IconLink,
	IconList,
	IconListNumbers,
	IconStrikethrough,
} from "@tabler/icons-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { applyMarkdown, type MarkdownAction } from "./markdown-format";

interface FormattingToolbarProps {
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	value: string;
	onChange: (value: string) => void;
}

interface ActionDef {
	action: MarkdownAction;
	label: string;
	Icon: typeof IconBold;
}

const ACTIONS: ActionDef[] = [
	{ action: "bold", label: "Pogrubienie", Icon: IconBold },
	{ action: "italic", label: "Kursywa", Icon: IconItalic },
	{ action: "strikethrough", label: "Przekreślenie", Icon: IconStrikethrough },
	{ action: "h1", label: "Nagłówek 1", Icon: IconH1 },
	{ action: "h2", label: "Nagłówek 2", Icon: IconH2 },
	{ action: "h3", label: "Nagłówek 3", Icon: IconH3 },
	{ action: "bullet", label: "Lista punktowana", Icon: IconList },
	{ action: "ordered", label: "Lista numerowana", Icon: IconListNumbers },
	{ action: "link", label: "Link", Icon: IconLink },
];

/**
 * Toolbar formatowania inline (B / I / S) — post-only.
 *
 * Klej DOM nad czystym `applyMarkdown`: czyta selekcję textarea, woła akcję
 * i zapisuje wynik (wartość + przywrócona selekcja). `onMouseDown` blokuje
 * blur, żeby klik nie zabrał zaznaczenia z pola tekstowego.
 */
export function FormattingToolbar({ textareaRef, value, onChange }: FormattingToolbarProps) {
	function apply(action: MarkdownAction) {
		const el = textareaRef.current;
		const start = el?.selectionStart ?? value.length;
		const end = el?.selectionEnd ?? value.length;
		const result = applyMarkdown({ value, selectionStart: start, selectionEnd: end }, action);
		onChange(result.value);
		// Przywróć selekcję po commicie Reacta (jak selectUser w MentionInput).
		requestAnimationFrame(() => {
			el?.focus();
			el?.setSelectionRange(result.selectionStart, result.selectionEnd);
		});
	}

	return (
		<div role="toolbar" aria-label="Formatowanie tekstu" className="flex items-center gap-1">
			{ACTIONS.map(({ action, label, Icon }) => (
				<Button
					key={action}
					type="button"
					variant="ghost"
					size="icon"
					aria-label={label}
					title={label}
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => apply(action)}
				>
					<Icon className="h-4 w-4" />
				</Button>
			))}
		</div>
	);
}
