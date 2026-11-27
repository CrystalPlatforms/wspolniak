// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconArrowLeft, IconChartBar, IconMapPin, IconPaperclip } from "@tabler/icons-react";
import { useRef } from "react";
import type { VideoPublishProgress } from "@/components/app/use-publish-post";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import type { ImageUploadProgress } from "@/images/upload";
import { cn } from "@/lib/utils";

interface ComposerHeaderProps {
	/** Tytuł ekranu: „Nowy post” albo „Edytuj post”. */
	title: string;
	/** Strzałka powrotu — bez callbacku sam tytuł (tworzenie posta). */
	onBack?: () => void;
	/** Podpis strzałki (czytniki ekranu, tooltip). */
	backLabel: string;
}

/**
 * Nagłówek kompozytora (reviza #187): strzałka powrotu i tytuł. Rysuje go forma,
 * więc tworzenie i edycja posta mają identyczny nagłówek (#251).
 */
export function ComposerHeader({ title, onBack, backLabel }: ComposerHeaderProps) {
	return (
		<div className="mb-2 flex items-center gap-4">
			{onBack && (
				<button
					type="button"
					onClick={onBack}
					aria-label={backLabel}
					className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
					title={backLabel}
				>
					<IconArrowLeft className="h-5 w-5" aria-hidden="true" />
				</button>
			)}
			<h1 className="text-2xl font-bold text-foreground">{title}</h1>
		</div>
	);
}

/**
 * Przycisk paska dodawania: ikona + napis, trzy w jednej linii (mobile też).
 * Na mobile krótkie napisy: Załączniki / Ankieta / Położenie (reviza usera);
 * desktop pełne: Dodaj załączniki / Dodaj ankietę / Dodaj położenie.
 */
function ToolbarAction({
	label,
	labelMobile,
	icon: Icon,
	onClick,
	pressed,
	hasPopup,
	disabled,
	unavailableReason,
}: {
	label: string;
	labelMobile: string;
	icon: typeof IconPaperclip;
	onClick: () => void;
	pressed?: boolean;
	hasPopup?: boolean;
	disabled?: boolean;
	/** Przycisk niedostępny (np. ankieta w edycji posta): wyszarzony, z tą podpowiedzią. */
	unavailableReason?: string;
}) {
	const unavailable = unavailableReason !== undefined;
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={hasPopup ? undefined : pressed}
			aria-haspopup={hasPopup && !unavailable ? "dialog" : undefined}
			// aria-disabled zamiast disabled: przycisk zostaje osiągalny dla czytników
			// ekranu i pokazuje podpowiedź, a klik nic nie robi.
			aria-disabled={unavailable ? true : undefined}
			title={unavailable ? unavailableReason : label}
			onClick={() => {
				if (!unavailable) onClick();
			}}
			disabled={disabled}
			className={cn(
				"flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border bg-background px-2 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent sm:py-2 sm:text-sm",
				pressed ? "border-primary bg-accent text-accent-foreground" : "border-input",
				unavailable && "cursor-not-allowed opacity-50",
			)}
		>
			<Icon className="size-4 shrink-0" aria-hidden="true" />
			<span className="truncate sm:hidden">{labelMobile}</span>
			<span className="hidden truncate sm:inline">{label}</span>
		</button>
	);
}

interface ComposerToolbarProps {
	/** Wybór z wybierarki „Dodaj załączniki” — wszystkie typy; podział robi forma. */
	onPickAttachments: (files: File[]) => void;
	onAddPoll?: () => void;
	/**
	 * Ankieta niedostępna (edycja opublikowanego posta) — „Dodaj ankietę” zostaje
	 * w pasku, ale jest wyszarzony z tą podpowiedzią i nic nie robi.
	 */
	pollUnavailableReason?: string;
	onAddLocation: () => void;
	disabled?: boolean;
}

/**
 * Pasek dodawania kompozytora (reviza usera): trzy przyciski z napisami w jednej
 * linii (mobile też, krótkie napisy na małych ekranach) i jedna ukryta wybierarka.
 * „Dodaj załączniki” otwiera od razu wybierarkę plików — bez osobnych okien.
 */
export function ComposerToolbar({
	onPickAttachments,
	onAddPoll,
	pollUnavailableReason,
	onAddLocation,
	disabled = false,
}: ComposerToolbarProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	return (
		<div role="toolbar" aria-label="Dodaj do posta" className="flex items-stretch gap-1.5">
			{/* Bez `accept`: wybierarka pokazuje WSZYSTKIE pliki (.apk, .md itd. —
			    reviza usera); podział i odrzucenia (wideo na YouTube, reszta do R2,
			    limity rozmiaru/liczby) robi splitAttachmentFiles. */}
			<input
				ref={inputRef}
				type="file"
				multiple
				onChange={(e) => {
					const incoming = Array.from(e.target.files ?? []);
					e.target.value = "";
					if (incoming.length > 0) onPickAttachments(incoming);
				}}
				// #250: hint limitu — czytany przez czytniki ekranu i pokazywany
				// jako tooltip; w natywnym pickerze iOS/Android limit komunikuje
				// Toast wrappera Androida (MainActivity.onShowFileChooser).
				title="Wybierz do 10 zdjęć"
				className="hidden"
			/>
			<ToolbarAction
				label="Dodaj załączniki"
				labelMobile="Załączniki"
				icon={IconPaperclip}
				onClick={() => inputRef.current?.click()}
				disabled={disabled}
			/>
			<ToolbarAction
				label="Dodaj ankietę"
				labelMobile="Ankieta"
				icon={IconChartBar}
				onClick={() => onAddPoll?.()}
				hasPopup
				disabled={disabled}
				unavailableReason={pollUnavailableReason}
			/>
			<ToolbarAction
				label="Dodaj położenie"
				labelMobile="Położenie"
				icon={IconMapPin}
				onClick={onAddLocation}
				hasPopup
				disabled={disabled}
			/>
		</div>
	);
}

interface ComposerSubmitButtonProps {
	isSubmitting: boolean;
	canSubmit: boolean;
	/** Postęp wgrywania wideo — label „Wideo 1/2 — 45%”. */
	uploadProgress: VideoPublishProgress | null;
	/** Postęp wgrywania zdjęć z realnych bajtów („Zdjęcie i/N — x%”) — issue #203. */
	imageProgress: ImageUploadProgress | null;
	/** Upload zdjęcia trwa dłużej niż 7 s (issue #199) — ostrzeżenie „wolne łącze”. */
	isSlowUpload?: boolean;
	/** Napis w spoczynku: „Opublikuj” albo „Zapisz zmiany”. */
	idleLabel: string;
	/** Napis podczas wysyłki: „Publikowanie...” albo „Zapisywanie...”. */
	busyLabel: string;
}

/**
 * Przycisk wysyłki kompozytora (publikacja i zapis edycji — #251): pasek
 * postępu, biały Loader i napis wg fazy (zdjęcia/wideo); nad przyciskiem, przy
 * wolnym łączu, ostrzeżenie, które nie blokujeje wysyłki.
 */
export function ComposerSubmitButton({
	isSubmitting,
	canSubmit,
	uploadProgress,
	imageProgress,
	isSlowUpload = false,
	idleLabel,
	busyLabel,
}: ComposerSubmitButtonProps) {
	return (
		<>
			{isSubmitting && isSlowUpload ? (
				<output className="block text-sm text-muted-foreground">
					Masz wolne połączenie internetowe. Przesyłanie zdjęć może potrwać dłużej.
				</output>
			) : null}
			<Button
				type="submit"
				className={cn(
					"relative h-11 w-full overflow-hidden sm:h-9",
					// W trakcie wysyłki przycisk na niebiesko (Secondary #0c275f),
					// żeby biały Loader nie zlewał się z zielonym tłem (reviza usera).
					isSubmitting && "bg-[#0c275f] text-white hover:bg-[#0c275f]/90",
				)}
				disabled={!canSubmit}
			>
				{isSubmitting ? (
					<>
						<span
							aria-hidden
							className="absolute inset-0 origin-left animate-[publish-indeterminate_7s_ease-out_forwards] bg-primary-foreground/20"
						/>
						{/* "Opatentowany" Loader — biały (inline style wygrywa z loader.css). */}
						<Loader loading size={4} color="#FFFFFF" className="relative mr-2" />
					</>
				) : null}
				<span className="relative">
					{isSubmitting
						? imageProgress
							? `Zdjęcie ${imageProgress.fileIndex + 1}/${imageProgress.total} — ${imageProgress.percent}%`
							: uploadProgress
								? `Wgrywanie wideo ${uploadProgress.videoIndex + 1}/${uploadProgress.total}…`
								: busyLabel
						: idleLabel}
				</span>
			</Button>
		</>
	);
}
