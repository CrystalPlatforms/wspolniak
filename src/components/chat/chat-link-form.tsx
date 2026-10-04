// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from "react";
import { linkUrlError, normalizeLinkUrl } from "./link-tokens";

export interface ChatLinkFormProps {
	/** Zapis → buduje token i wstawia go do inputu czatu rodzica. */
	onSave: (input: { title: string; url: string }) => void;
	/** Anuluj/Escape → zamyka formularz bez wstawiania. */
	onCancel: () => void;
}

/**
 * Mini-formularz `/link` (#214 — Chat F1): opcjonalny tytuł i tekst linku,
 * wymagany URL. Pusty/niepoprawny URL blokuje zapis widocznym komunikatem
 * (role=alert). Enter w polu = zapis — preventDefault, żeby nie wysłał czatu
 * (formularz żyje wewnątrz formularza wysyłki wiadomości).
 */
export function ChatLinkForm({ onSave, onCancel }: ChatLinkFormProps) {
	const [title, setTitle] = useState("");
	const [url, setUrl] = useState("");
	const [error, setError] = useState<string | null>(null);

	/** Zapis: walidacja przez linkUrlError (jedno źródło prawdy), potem onSave. */
	function handleSave() {
		const message = linkUrlError(url);
		if (message) {
			setError(message);
			return;
		}
		// URL normalizowany (apple.com → https://apple.com) — chip potrzebuje pełnego adresu.
		onSave({ title: title.trim(), url: normalizeLinkUrl(url) });
	}

	/**
	 * Enter w polu = zapis (preventDefault — inaczej Enter bąbelkuje do formularza
	 * wysyłki wiadomości i wysłałby czat); Escape = anuluj.
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
		<div data-link-form className="mb-2 rounded-xl border border-border bg-popover p-3 shadow-md">
			<div className="flex flex-col gap-2">
				<div>
					<label htmlFor="chat-link-title" className="text-xs font-medium text-muted-foreground">
						Tytuł
					</label>
					<input
						id="chat-link-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						onKeyDown={handleFieldKeyDown}
						className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div>
					<label htmlFor="chat-link-url" className="text-xs font-medium text-muted-foreground">
						Adres URL
					</label>
					<input
						id="chat-link-url"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						onKeyDown={handleFieldKeyDown}
						className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
					{error ? (
						<p role="alert" className="mt-1 text-xs text-destructive">
							{error}
						</p>
					) : null}
				</div>
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
						className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
					>
						Wstaw
					</button>
				</div>
			</div>
		</div>
	);
}
