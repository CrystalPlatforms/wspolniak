// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconPaperclip, IconX } from "@tabler/icons-react";
import { type ChangeEvent, useState } from "react";
import { MAX_POST_FILE_BYTES, MAX_POST_FILES } from "@/db/post-files/schema";

export interface ComposerFilesSectionProps {
	/** Wybrane pliki (stan trzyma forma — lecą do uploadu przy publikacji). */
	files: File[];
	onChange: (files: File[]) => void;
	disabled?: boolean;
	/** Istniejące załączniki (edycja posta) — wliczane do limitu 5. */
	existingCount?: number;
}

/** Rozmiar pliku po ludzku: "512 B", "12,5 KB", "3,2 MB". */
export function formatPostFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} KB`;
	}
	return `${(bytes / (1024 * 1024)).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} MB`;
}

/** Zbiór z pickerów: akceptowane dochodzą po kolei, licznik rośnie per plik. */
interface PickResult {
	accepted: File[];
	firstRejection: { file: File; reason: string } | null;
	rejectedCount: number;
}

function pickFiles(picked: File[], current: File[], existingCount = 0): PickResult {
	const accepted: File[] = [];
	let firstRejection: PickResult["firstRejection"] = null;
	let rejectedCount = 0;
	let count = current.length + existingCount;
	for (const file of picked) {
		const reason = fileRejection(file, count);
		if (reason) {
			rejectedCount += 1;
			if (!firstRejection) firstRejection = { file, reason };
			continue;
		}
		accepted.push(file);
		count += 1;
	}
	return { accepted, firstRejection, rejectedCount };
}

function rejectionMessage(result: PickResult): string | null {
	if (!result.firstRejection) return null;
	const suffix = result.rejectedCount > 1 ? ` (i ${result.rejectedCount - 1} więcej)` : "";
	return `${result.firstRejection.file.name}: ${result.firstRejection.reason}${suffix}`;
}

/** Powód odrzucenia pliku (limit liczby/rozmiaru/wideo) albo null, gdy może lecieć. */
function fileRejection(file: File, existingCount: number): string | null {
	const mimeType = file.type || "application/octet-stream";
	if (mimeType.startsWith("video/")) return "pliki wideo nie są obsługiwane";
	if (file.size > MAX_POST_FILE_BYTES) return "przekracza limit 19 MB";
	if (existingCount >= MAX_POST_FILES) return `limit ${MAX_POST_FILES} plików na post`;
	return null;
}

/**
 * Sekcja "Pliki" kompozytora (#243): wybierarka z walidacją po stronie klienta
 * (max 5 plików × 19 MB, bez wideo) i lista wybranych z możliwością usunięcia
 * przed publikacją. Pliki idą do R2 dopiero przy publikacji — refresh strony
 * traci wybrane, tak jak zdjęcia.
 */
export function ComposerFilesSection({
	files,
	onChange,
	disabled = false,
	existingCount = 0,
}: ComposerFilesSectionProps) {
	const [error, setError] = useState<string | null>(null);
	const pick = (picked: File[], base: File[]) => {
		const result = pickFiles(picked, base, existingCount);
		setError(rejectionMessage(result));
		if (result.accepted.length > 0) {
			onChange([...base, ...result.accepted]);
		}
	};

	if (files.length === 0) {
		return (
			<div className="space-y-2">
				<FileToggle disabled={disabled} onPick={(picked) => pick(picked, files)} />
				{error ? (
					<p role="alert" className="text-xs text-destructive">
						{error}
					</p>
				) : null}
			</div>
		);
	}

	function removeFile(index: number) {
		onChange(files.filter((_, i) => i !== index));
		setError(null);
	}

	return (
		<div data-composer-files className="space-y-2 rounded-md border border-border bg-card p-3">
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm font-medium text-foreground">
					Pliki{" "}
					<span className="text-xs text-muted-foreground">
						{files.length}/{MAX_POST_FILES}
					</span>
				</p>
				<button
					type="button"
					onClick={() => onChange([])}
					aria-label="Usuń wszystkie pliki"
					className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<IconX className="size-4" aria-hidden="true" />
				</button>
			</div>
			<ul className="flex flex-col gap-1">
				{files.map((file, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: wiersz identyfikuje pozycja w wybieraniu
					<li key={index} className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5">
						<IconPaperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						<span className="min-w-0 flex-1 truncate text-sm text-foreground" title={file.name}>
							{file.name}
						</span>
						<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
							{formatPostFileSize(file.size)}
						</span>
						<button
							type="button"
							onClick={() => removeFile(index)}
							aria-label={`Usuń plik ${file.name}`}
							className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<IconX className="size-4" aria-hidden="true" />
						</button>
					</li>
				))}
			</ul>
			<FileToggle disabled={disabled} onPick={(picked) => pick(picked, files)} />
			{error ? (
				<p role="alert" className="text-xs text-destructive">
					{error}
				</p>
			) : null}
		</div>
	);
}

/** Przycisk "Dodaj pliki" + ukryty input (natywna wybierarka). */
function FileToggle({ disabled, onPick }: { disabled: boolean; onPick: (files: File[]) => void }) {
	return (
		<>
			<button
				type="button"
				data-testid="composer-files-toggle"
				className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:h-9"
				disabled={disabled}
				onClick={() => document.getElementById("composer-files-input")?.click()}
			>
				<IconPaperclip className="h-4 w-4" aria-hidden="true" />
				Dodaj pliki
			</button>
			<input
				id="composer-files-input"
				type="file"
				multiple
				className="hidden"
				onChange={(e: ChangeEvent<HTMLInputElement>) => {
					const picked = Array.from(e.target.files ?? []);
					if (picked.length > 0) onPick(picked);
					e.target.value = "";
				}}
			/>
		</>
	);
}
