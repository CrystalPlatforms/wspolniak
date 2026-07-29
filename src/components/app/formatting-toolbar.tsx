// SPDX-License-Identifier: AGPL-3.0-or-later
import { Bold, Italic, Strikethrough } from "lucide-react";
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
	Icon: typeof Bold;
}

const ACTIONS: ActionDef[] = [
	{ action: "bold", label: "Pogrubienie", Icon: Bold },
	{ action: "italic", label: "Kursywa", Icon: Italic },
	{ action: "strikethrough", label: "Przekreślenie", Icon: Strikethrough },
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
