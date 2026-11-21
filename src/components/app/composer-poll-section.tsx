// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconPlus, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { postPollSchema } from "@/db/posts/schema";

/** Szkic ankiety w kompozytorze — walidowany schematem wysyłki przy zapisie. */
export interface PollDraft {
	question: string;
	options: string[];
}

export interface ComposerPollDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Zapisany szkic (z chipa) — edytowany w dialogu; null = nowa ankieta. */
	value: PollDraft | null;
	onSave: (draft: PollDraft) => void;
}

const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

/**
 * Dialog ankiety (#241, reviza usera: zamiast rozwijanej sekcji): pytanie +
 * 2-6 opcji. Edycja w dialogu działa na kopii szkicu — "Anuluj" odrzuca zmiany,
 * "Zapisz ankietę" waliduje schematem wysyłki (to samo źródło prawdy co serwer)
 * i dopiero wtedy domyka dialog.
 */
export function ComposerPollDialog({ open, onOpenChange, value, onSave }: ComposerPollDialogProps) {
	const [question, setQuestion] = useState("");
	const [options, setOptions] = useState<string[]>(["", ""]);
	const [error, setError] = useState<string | null>(null);

	// Otwarcie = start od kopii zapisanego szkicu (albo pustej ankiety).
	useEffect(() => {
		if (open) {
			setQuestion(value?.question ?? "");
			setOptions(value?.options ?? ["", ""]);
			setError(null);
		}
	}, [open, value]);

	function updateOption(index: number, next: string) {
		setOptions(options.map((option, i) => (i === index ? next : option)));
	}

	function addOption() {
		if (options.length >= MAX_OPTIONS) return;
		setOptions([...options, ""]);
	}

	function removeOption(index: number) {
		if (options.length <= MIN_OPTIONS) return;
		setOptions(options.filter((_, i) => i !== index));
	}

	function handleSave() {
		const parsed = postPollSchema.safeParse({ question, options });
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			const path = issue?.path ?? [];
			// Płaski schemat: błąd opcji ma ścieżkę ["options", <index>].
			if (path[0] === "options" && typeof path[1] === "number") {
				setError(`Opcja ${path[1] + 1}: ${issue?.message ?? "niepoprawna opcja"}`);
			} else {
				setError(issue?.message ?? "Uzupełnij ankietę");
			}
			return;
		}
		onSave(parsed.data);
		onOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Ankieta</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<div>
						<label
							htmlFor="composer-poll-question"
							className="text-xs font-medium text-muted-foreground"
						>
							Pytanie
						</label>
						<input
							id="composer-poll-question"
							value={question}
							onChange={(e) => setQuestion(e.target.value)}
							maxLength={200}
							placeholder="np. Dokąd jedziemy na wakacje…"
							className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						{options.map((option, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: opcje to pozycyjne pola formularza
							<div key={index} className="flex items-center gap-1.5">
								<label htmlFor={`composer-poll-option-${index}`} className="sr-only">
									Opcja {index + 1}
								</label>
								<input
									id={`composer-poll-option-${index}`}
									value={option}
									onChange={(e) => updateOption(index, e.target.value)}
									maxLength={100}
									placeholder={`Opcja ${index + 1}`}
									className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
								{options.length > MIN_OPTIONS && (
									<button
										type="button"
										onClick={() => removeOption(index)}
										aria-label={`Usuń opcję ${index + 1}`}
										className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
									>
										<IconX className="size-4" aria-hidden="true" />
									</button>
								)}
							</div>
						))}
					</div>
					{options.length < MAX_OPTIONS && (
						<button
							type="button"
							onClick={addOption}
							className="flex items-center gap-1 self-start rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<IconPlus className="size-3.5" aria-hidden="true" />
							Dodaj opcję
						</button>
					)}
					{error ? (
						<p role="alert" className="text-xs text-destructive">
							{error}
						</p>
					) : null}
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Anuluj
					</Button>
					<Button type="button" onClick={handleSave}>
						Zapisz ankietę
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** Walidacja szkicu schematem wysyłki; zwraca komunikat albo null (do testów i submitu). */
export function pollDraftError(draft: PollDraft): string | null {
	const parsed = postPollSchema.safeParse({
		question: draft.question,
		options: draft.options,
	});
	if (parsed.success) return null;
	const issue = parsed.error.issues[0];
	const path = issue?.path ?? [];
	// Płaski schemat: błąd opcji ma ścieżkę ["options", <index>].
	if (path[0] === "options" && typeof path[1] === "number") {
		return `Opcja ${path[1] + 1}: ${issue?.message ?? "niepoprawna opcja"}`;
	}
	return issue?.message ?? "Uzupełnij ankietę przed publikacją";
}
