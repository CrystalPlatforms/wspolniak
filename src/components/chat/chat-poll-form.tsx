// SPDX-License-Identifier: AGPL-3.0-or-later
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { createChatMessageSchema } from "@/db/chat/schema";

export interface ChatPollFormProps {
	/** Zapis → ChatView wysyła wiadomość kind='poll' (walidacja tym samym Zodem co serwer). */
	onSave: (input: { question: string; options: string[] }) => void;
	/** Anuluj/Escape → zamyka formularz bez wysyłania. */
	onCancel: () => void;
	/** Wysyłka w toku — blokuje przycisk (mutation w ChatView). */
	pending?: boolean;
}

/** Limity formularza = limity schematu (pytanie 200, opcje 2–6 po 100 znaków). */
const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

/**
 * Mini-formularz `/ankieta` (F2 #215): pytanie + 2–6 opcji. Startuje z dwóch
 * pustych pól; kolejne dochodzą przyciskiem, zbędne znika krzyżykiem (min. 2).
 * Pusty formularz blokuje wysyłkę widocznym komunikatem (role=alert).
 * Enter w polu = zapis (preventDefault — inaczej bąbelkuje do formularza
 * wysyłki wiadomości); Escape = anuluj.
 */
export function ChatPollForm({ onSave, onCancel, pending = false }: ChatPollFormProps) {
	const [question, setQuestion] = useState("");
	const [options, setOptions] = useState<string[]>(["", ""]);
	const [error, setError] = useState<string | null>(null);
	// Indeks opcji z błędem (podświetla wiersz); null = błąd globalny (pytanie/liczba opcji).
	const [errorOption, setErrorOption] = useState<number | null>(null);

	function updateOption(index: number, value: string) {
		setOptions((prev) => prev.map((option, i) => (i === index ? value : option)));
	}

	function addOption() {
		setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, ""]));
	}

	function removeOption(index: number) {
		setOptions((prev) => (prev.length <= MIN_OPTIONS ? prev : prev.filter((_, i) => i !== index)));
	}

	/** Zapis: walidacja schematem wysyłki (jedno źródło prawdy z serwerem). */
	function handleSave() {
		const parsed = createChatMessageSchema.safeParse({
			kind: "poll",
			text: question,
			payload: { options },
		});
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			const path = issue?.path ?? [];
			// Błąd konkretnej opcji: path ["payload","options",<index>] — podświetlamy wiersz.
			if (path[0] === "payload" && typeof path[2] === "number") {
				setErrorOption(path[2]);
				setError(issue?.message ?? "Niepoprawna opcja");
			} else {
				setErrorOption(null);
				setError(issue?.message ?? "Niepoprawna ankieta");
			}
			return;
		}
		const data = parsed.data;
		if (data.kind !== "poll") return;
		onSave({ question: data.text, options: data.payload.options });
	}

	/**
	 * Enter w polu = zapis (preventDefault — nie wysyłaj czatu); Escape = anuluj.
	 */
	function handleFieldKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (event.key === "Enter") {
			event.preventDefault();
			handleSave();
		}
		if (event.key === "Escape") {
			event.preventDefault();
			onCancel();
		}
	}

	return (
		<div data-poll-form className="mb-2 rounded-xl border border-border bg-popover p-3 shadow-md">
			<div className="flex flex-col gap-2">
				<div>
					<label htmlFor="chat-poll-question" className="text-xs font-medium text-muted-foreground">
						Pytanie
					</label>
					<input
						id="chat-poll-question"
						value={question}
						onChange={(e) => setQuestion(e.target.value)}
						onKeyDown={handleFieldKeyDown}
						maxLength={200}
						className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					{options.map((option, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: opcje to pozycyjne pola formularza — indeks JEST tożsamością wiersza
						<div key={index} className="flex items-center gap-1.5">
							<label htmlFor={`chat-poll-option-${index}`} className="sr-only">
								Opcja {index + 1}
							</label>
							<input
								id={`chat-poll-option-${index}`}
								value={option}
								onChange={(e) => updateOption(index, e.target.value)}
								onKeyDown={handleFieldKeyDown}
								maxLength={100}
								placeholder={`Opcja ${index + 1}`}
								aria-invalid={errorOption === index || undefined}
								className={`w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errorOption === index ? "border-destructive" : ""}`}
							/>
							{options.length > MIN_OPTIONS ? (
								<button
									type="button"
									onClick={() => removeOption(index)}
									aria-label={`Usuń opcję ${index + 1}`}
									className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								>
									<X className="size-4" />
								</button>
							) : null}
						</div>
					))}
				</div>
				{options.length < MAX_OPTIONS ? (
					<button
						type="button"
						onClick={addOption}
						className="flex items-center gap-1 self-start rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<Plus className="size-3.5" />
						Dodaj opcję
					</button>
				) : null}
				{error ? (
					<p role="alert" className="text-xs text-destructive">
						{error}
					</p>
				) : null}
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						Anuluj
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={pending}
						className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
					>
						{pending ? "Wysyłanie…" : "Wyślij ankietę"}
					</button>
				</div>
			</div>
		</div>
	);
}
