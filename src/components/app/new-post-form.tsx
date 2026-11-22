// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconArrowLeft, IconChartBar, IconMapPin, IconPaperclip } from "@tabler/icons-react";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
	ComposerAttachmentsGrid,
	MAX_IMAGE_BYTES,
	type MediaItem,
	toMediaItem,
	type VideoDraft,
} from "@/components/app/composer-image-grid";
import {
	ComposerLocationDialog,
	type LocationDraft,
	locationDraftError,
} from "@/components/app/composer-location-section";
import {
	ComposerPollDialog,
	type PollDraft,
	pollDraftError,
} from "@/components/app/composer-poll-section";
import type { Mention } from "@/components/app/mention-input";
import { OversizedImageDialog } from "@/components/app/oversized-image-dialog";
import { PostDescriptionField } from "@/components/app/post-description-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { MAX_POST_FILE_BYTES, MAX_POST_FILES } from "@/db/post-files/schema";
import { MAX_DESCRIPTION_LENGTH, MAX_POST_VIDEOS, postPollSchema } from "@/db/posts/schema";
import type { ImageUploadProgress } from "@/images/upload";
import { maybeIngestSharedFiles } from "@/lib/android-bridge";
import { cn } from "@/lib/utils";
import { takePendingFiles } from "@/lib/waiting-room";

const MAX_FILE_SIZE_MB = 19;
/** Limit zdjęć kompozytora (jedno źródło prawdy dla walidacji i tytułu przycisku). */
const MAX_IMAGES = 10;

interface NewPostFormProps {
	onSubmit: (data: {
		description: string;
		files: File[];
		pendingVideos: { file: File; title: string }[];
		mentions: Mention[];
		/** Ankieta (#241) — walidowana schematem wysyłki; null/undefined = brak. */
		poll?: { question: string; options: string[] } | null;
		/** Lokalizacja (#242) — walidowana schematem wysyłki; null/undefined = brak. */
		location?: { lat: number; lng: number; label?: string } | null;
		/** Pliki (#243) — lecą do R2 przy publikacji (max 5 × 19 MB, bez wideo). */
		postFiles?: File[];
	}) => void;
	isSubmitting: boolean;
	/** Postęp uploadu wideo przy publikacji — label przycisku "Wideo 1/2 - 45%" (#194). */
	uploadProgress?: { videoIndex: number; total: number; percent: number } | null;
	/** Wstępnie wypełniony opis (np. szablon "Zaproponuj datę", #163). */
	initialDescription?: string;
	/**
	 * Upload zdjęcia trwa dłużej niż 7 s (issue #199) — pokazujemy ostrzeżenie
	 * "wolne łącze" bez blokowania publikacji.
	 */
	isSlowUpload?: boolean;
	/** Postęp uploadu zdjęć z realnych bajtów ("Zdjęcie i/N - x%") — issue #203. */
	imageProgress?: ImageUploadProgress | null;
	/** Reviza #187: nagłówek (strzałka + "Nowy post") rysuje sama forma. */
	onBack?: () => void;
}

/**
 * Odbiór poczekalni plików (Android Wrapper F1, #220): pliki włożone przez
 * putPendingFiles forma bierze raz, przy montażu. Podział po MIME:
 * image/* -> kafelki zdjęć, video/* -> kafelki wideo (tytuł z nazwy pliku),
 * reszta ignorowana. Odbiór zamyka się w kafelkach jak zwykłe załączniki.
 */
function applyPendingFiles(
	setMedia: (next: MediaItem[]) => void,
	setPendingVideos: (next: VideoDraft[]) => void,
): void {
	const pending = takePendingFiles();
	const photos = pending.filter((f) => f.type.startsWith("image/"));
	if (photos.length > 0) setMedia([...photos.map(toMediaItem)]);
	const videos = pending.filter((f) => f.type.startsWith("video/"));
	if (videos.length > 0) {
		setPendingVideos(
			videos.map((file, index) => ({
				key: `vid-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
				file,
				title: file.name.replace(/\.[^.]+$/, "").trim(),
				preview: URL.createObjectURL(file),
			})),
		);
	}
}

/**
 * Walidacja zapisanego szkicu ankiety schematem wysyłki (#241) — ostatnia
 * linia obrony przed POST-em; dialog zapisuje już zwalidowany szkic.
 */
/** Wynik podziału wyboru z wybierarki na kafelki (reviza usera). */
interface AttachmentSplit {
	images: MediaItem[];
	videos: VideoDraft[];
	files: File[];
	errors: string[];
}

/** Aktualne zapełnienie kafelków — limity liczone per typ. */
interface AttachmentCounts {
	images: number;
	videos: number;
	files: number;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: liniowy klasyfikator MIME z limitami — split na helpery zaciemniłby kod
function splitAttachmentFiles(incoming: File[], counts: AttachmentCounts): AttachmentSplit {
	const split: AttachmentSplit = { images: [], videos: [], files: [], errors: [] };
	for (const file of incoming) {
		const mime = file.type || "application/octet-stream";
		if (mime.startsWith("image/")) {
			if (counts.images + split.images.length >= MAX_IMAGES) {
				split.errors.push(`${file.name}: limit ${MAX_IMAGES} zdjęć`);
				continue;
			}
			split.images.push(toMediaItem(file, counts.images + split.images.length));
		} else if (mime.startsWith("video/")) {
			if (counts.videos + split.videos.length >= MAX_POST_VIDEOS) {
				split.errors.push(`${file.name}: limit ${MAX_POST_VIDEOS} wideo`);
				continue;
			}
			split.videos.push({
				key: `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				file,
				title: file.name.replace(/\.[^.]+$/, "").trim(),
				preview: URL.createObjectURL(file),
			});
		} else {
			if (counts.files + split.files.length >= MAX_POST_FILES) {
				split.errors.push(`${file.name}: limit ${MAX_POST_FILES} plików`);
				continue;
			}
			if (file.size > MAX_POST_FILE_BYTES) {
				split.errors.push(`${file.name}: przekracza limit ${MAX_FILE_SIZE_MB} MB`);
				continue;
			}
			split.files.push(file);
		}
	}
	return split;
}

function resolvePollDraft(draft: PollDraft | null): {
	poll: { question: string; options: string[] } | null;
	error: string | null;
} {
	if (!draft) return { poll: null, error: null };
	const parsed = postPollSchemaSafeParse(draft);
	if (!parsed.ok) {
		return { poll: null, error: pollDraftError(draft) ?? "Uzupełnij ankietę przed publikacją" };
	}
	return { poll: parsed.poll, error: null };
}

function postPollSchemaSafeParse(
	draft: PollDraft,
): { ok: true; poll: { question: string; options: string[] } } | { ok: false } {
	const parsed = postPollSchema.safeParse({ question: draft.question, options: draft.options });
	if (!parsed.success) return { ok: false };
	return { ok: true, poll: parsed.data };
}

/**
 * Walidacja zapisanego szkicu lokalizacji schematem wysyłki (#242) — bez
 * pinezki (0,0) to częste przeoczenie; komunikat każe wskazać miejsce albo
 * usunąć lokalizację z posta.
 */
function resolveLocationDraft(draft: LocationDraft | null): {
	location: { lat: number; lng: number; label?: string } | null;
	error: string | null;
} {
	if (!draft) return { location: null, error: null };
	if (draft.lat === 0 && draft.lng === 0) {
		return { location: null, error: "Wskaż miejsce na mapie albo usuń lokalizację z posta" };
	}
	const draftError = locationDraftError(draft);
	if (draftError) return { location: null, error: draftError };
	const label = draft.label.trim();
	return { location: { lat: draft.lat, lng: draft.lng, ...(label ? { label } : {}) }, error: null };
}

/**
 * Reviza #187: nagłówek kompozytora — strzałka powrotu i tytuł.
 */
function ComposerHeader({ onBack }: { onBack?: () => void }) {
	return (
		<div className="mb-2 flex items-center gap-4">
			{onBack && (
				<button
					type="button"
					onClick={onBack}
					className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
					title="Wróć do feeda"
				>
					<IconArrowLeft className="h-5 w-5" aria-hidden="true" />
				</button>
			)}
			<h1 className="text-2xl font-bold text-foreground">Nowy post</h1>
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
}: {
	label: string;
	labelMobile: string;
	icon: typeof IconPaperclip;
	onClick: () => void;
	pressed?: boolean;
	hasPopup?: boolean;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={hasPopup ? undefined : pressed}
			aria-haspopup={hasPopup ? "dialog" : undefined}
			title={label}
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border bg-background px-2 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent sm:py-2 sm:text-sm",
				pressed ? "border-primary bg-accent text-accent-foreground" : "border-input",
			)}
		>
			<Icon className="size-4 shrink-0" aria-hidden="true" />
			<span className="truncate sm:hidden">{labelMobile}</span>
			<span className="hidden truncate sm:inline">{label}</span>
		</button>
	);
}

export function NewPostForm({
	onSubmit,
	isSubmitting,
	uploadProgress = null,
	initialDescription,
	isSlowUpload = false,
	imageProgress = null,
	onBack,
}: NewPostFormProps) {
	const [description, setDescription] = useState(initialDescription ?? "");
	const [mentions, setMentions] = useState<Mention[]>([]);
	const [media, setMedia] = useState<MediaItem[]>([]);
	const [pendingVideos, setPendingVideos] = useState<VideoDraft[]>([]);
	/** Wybrane pliki (#243) — upload dopiero przy publikacji. */
	const [postFiles, setPostFiles] = useState<File[]>([]);
	/** Zapisane szkice (kafelki w siatce); edycja przez dialogi. */
	const [pollDraft, setPollDraft] = useState<PollDraft | null>(null);
	const [locationDraft, setLocationDraft] = useState<LocationDraft | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [oversizedId, setOversizedId] = useState<string | null>(null);
	const [pollDialogOpen, setPollDialogOpen] = useState(false);
	const [locationDialogOpen, setLocationDialogOpen] = useState(false);
	const imageInputRef = useRef<HTMLInputElement>(null);

	// Prefill „Zaproponuj datę" (reviza #245): search/initialDescription może
	// przyjść DO formularza (hydratacja SSR, preload trasy), a edytor WYSIWYG
	// jest uncontrolled (initial markdown = useRef przy montażu) — późno
	// przybyły szablon wstrzykujemy przez setDescription, a zmiana value
	// wraca do edytora jego zewnętrznym synciem (setMarkdown).
	useEffect(() => {
		if (initialDescription) {
			setDescription(initialDescription);
		}
	}, [initialDescription]);

	// Poczekalnia plików (#220): odbiór raz przy montażu (szczegóły: applyPendingFiles).
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			await maybeIngestSharedFiles();
			if (!cancelled) applyPendingFiles(setMedia, setPendingVideos);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const oversizedItem = media.find((m) => m.id === oversizedId) ?? null;

	/** Podmiana pliku po zmniejszeniu (issue #200): nowy podgląd, flaga zdjęta. */
	const replaceMediaFile = (id: string, nextFile: File) => {
		setMedia(
			media.map((item) => {
				if (item.id !== id) return item;
				if (item.preview) URL.revokeObjectURL(item.preview);
				return {
					...item,
					file: nextFile,
					preview: URL.createObjectURL(nextFile),
					isOversized: nextFile.size > MAX_IMAGE_BYTES,
				};
			}),
		);
	};

	/**
	 * "Dodaj załączniki" otwiera od razu wybierarkę plików (reviza usera — bez
	 * osobnych okien). Wybór dzieli się po MIME na kafelki: zdjęcia, wideo
	 * (tytuł z nazwy pliku, upload do YouTube przy publikacji) i pliki (R2).
	 */
	const handlePickAttachments = () => {
		imageInputRef.current?.click();
	};

	const handleAttachmentsFileChange = (e: ChangeEvent<HTMLInputElement>) => {
		const incoming = Array.from(e.target.files ?? []);
		if (incoming.length === 0) return;
		e.target.value = "";

		const split = splitAttachmentFiles(incoming, {
			images: media.length,
			videos: pendingVideos.length,
			files: postFiles.length,
		});
		if (split.images.length > 0) setMedia([...media, ...split.images]);
		if (split.videos.length > 0) setPendingVideos([...pendingVideos, ...split.videos]);
		if (split.files.length > 0) setPostFiles([...postFiles, ...split.files]);
		setError(split.errors.length > 0 ? split.errors.join(", ") : null);
	};

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const files = media.map((i) => i.file).filter((f): f is File => Boolean(f));
		const oversized = media.find((i) => i.isOversized && i.file);
		if (oversized?.file) {
			setError(
				`Zdjęcie "${oversized.file.name}" jest za duże. Kliknij jego podgląd i zmniejsz je, albo usuń je przed publikacją.`,
			);
			setOversizedId(oversized.id);
			return;
		}
		if (description.length > MAX_DESCRIPTION_LENGTH) {
			setError(
				`Tekst posta jest za długi. Limit to ${MAX_DESCRIPTION_LENGTH} znaków, wpisanych: ${description.length}`,
			);
			return;
		}
		// Szkice są walidowane przy zapisie w dialogu — tu tylko ostatnia linia obrony.
		const resolvedPoll = resolvePollDraft(pollDraft);
		const resolvedLocation = resolveLocationDraft(locationDraft);
		const draftError = resolvedPoll.error ?? resolvedLocation.error;
		if (draftError) {
			setError(draftError);
			return;
		}
		const { poll } = resolvedPoll;
		const { location } = resolvedLocation;
		if (
			media.length === 0 &&
			pendingVideos.length === 0 &&
			!description.trim() &&
			!poll &&
			!location &&
			postFiles.length === 0
		) {
			setError("Dodaj tekst, załączniki, ankietę albo położenie");
			return;
		}
		const validMentions = mentions.filter((m) => description.includes(`@${m.name}`));
		onSubmit({
			description,
			files,
			pendingVideos: pendingVideos.map(({ file, title }) => ({ file, title })),
			mentions: validMentions,
			poll,
			location,
			postFiles,
		});
	};

	const canSubmit = useMemo(
		() =>
			(media.length > 0 ||
				pendingVideos.length > 0 ||
				description.trim().length > 0 ||
				pollDraft !== null ||
				locationDraft !== null ||
				postFiles.length > 0) &&
			!isSubmitting,
		[
			media.length,
			description,
			isSubmitting,
			pendingVideos.length,
			pollDraft,
			locationDraft,
			postFiles.length,
		],
	);

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<ComposerHeader onBack={onBack} />

			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<div className="space-y-2">
				<PostDescriptionField
					value={description}
					onChange={setDescription}
					onMentionsChange={setMentions}
				/>
			</div>

			{/* Pasek dodawania: 3 przyciski z napisami w jednej linii (mobile też,
			    krótkie napisy na małych ekranach — reviza usera). */}
			<div role="toolbar" aria-label="Dodaj do posta" className="flex items-stretch gap-1.5">
				{/* Bez `accept`: wybierarka pokazuje WSZYSTKIE pliki (.apk, .md itd. —
				    reviza usera); podział i odrzucenia (wideo na YouTube, reszta do R2,
				    limity rozmiaru/liczby) robi splitAttachmentFiles. */}
				<input
					ref={imageInputRef}
					type="file"
					multiple
					onChange={handleAttachmentsFileChange}
					className="hidden"
				/>
				<ToolbarAction
					label="Dodaj załączniki"
					labelMobile="Załączniki"
					icon={IconPaperclip}
					onClick={handlePickAttachments}
					disabled={isSubmitting}
				/>
				<ToolbarAction
					label="Dodaj ankietę"
					labelMobile="Ankieta"
					icon={IconChartBar}
					onClick={() => setPollDialogOpen(true)}
					hasPopup
					disabled={isSubmitting}
				/>
				<ToolbarAction
					label="Dodaj położenie"
					labelMobile="Położenie"
					icon={IconMapPin}
					onClick={() => setLocationDialogOpen(true)}
					hasPopup
					disabled={isSubmitting}
				/>
			</div>

			{/* Jednolita siatka kafelków (reviza usera): zdjęcia, wideo, pliki,
			    ankieta i położenie — wszystko kwadraty z X; ankieta/położenie
			    z dużą własną ikoną, klik otwiera dialog do edycji. */}
			{(media.length > 0 ||
				pendingVideos.length > 0 ||
				postFiles.length > 0 ||
				pollDraft ||
				locationDraft) && (
				<ComposerAttachmentsGrid
					images={media}
					onImagesChange={setMedia}
					onOpenDetails={setOversizedId}
					videos={pendingVideos}
					onRemoveVideo={(key) => {
						const video = pendingVideos.find((v) => v.key === key);
						if (video) URL.revokeObjectURL(video.preview);
						setPendingVideos(pendingVideos.filter((v) => v.key !== key));
					}}
					files={postFiles}
					onRemoveFile={(index) => setPostFiles(postFiles.filter((_, i) => i !== index))}
					poll={pollDraft}
					onEditPoll={() => setPollDialogOpen(true)}
					onRemovePoll={() => setPollDraft(null)}
					location={locationDraft}
					onEditLocation={() => setLocationDialogOpen(true)}
					onRemoveLocation={() => setLocationDraft(null)}
				/>
			)}

			{/* Dialogi ankiety i położenia (#241, #242 — reviza usera). */}
			<ComposerPollDialog
				open={pollDialogOpen}
				onOpenChange={setPollDialogOpen}
				value={pollDraft}
				onSave={setPollDraft}
			/>
			<ComposerLocationDialog
				open={locationDialogOpen}
				onOpenChange={setLocationDialogOpen}
				value={locationDraft}
				onSave={setLocationDraft}
			/>

			{/* Dialog "za duże zdjęcie" (issue #200): błąd + akcja zmniejszenia. */}
			<OversizedImageDialog
				file={oversizedItem?.file ?? null}
				limitMb={MAX_FILE_SIZE_MB}
				open={oversizedItem !== null}
				onOpenChange={(o) => {
					if (!o) setOversizedId(null);
				}}
				onShrunk={(shrunkFile) => {
					if (oversizedId) replaceMediaFile(oversizedId, shrunkFile);
					setOversizedId(null);
				}}
			/>

			{isSubmitting && isSlowUpload ? (
				<output className="block text-sm text-muted-foreground">
					Masz wolne połączenie internetowe. Przesyłanie zdjęć może potrwać dłużej.
				</output>
			) : null}

			<PublishButton
				isSubmitting={isSubmitting}
				canSubmit={canSubmit}
				uploadProgress={uploadProgress}
				imageProgress={imageProgress}
			/>
		</form>
	);
}

interface PublishButtonProps {
	isSubmitting: boolean;
	canSubmit: boolean;
	uploadProgress: { videoIndex: number; total: number; percent: number } | null;
	imageProgress: ImageUploadProgress | null;
}

/** Przycisk publikacji: pasek postępu, Loader i label wg fazy (zdjęcia/wideo). */
function PublishButton({
	isSubmitting,
	canSubmit,
	uploadProgress,
	imageProgress,
}: PublishButtonProps) {
	return (
		<Button
			type="submit"
			className={cn(
				"relative h-11 w-full overflow-hidden sm:h-9",
				// W trakcie publikacji przycisk na niebiesko (Secondary #0c275f),
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
							: "Publikowanie..."
					: "Opublikuj"}
			</span>
		</Button>
	);
}
