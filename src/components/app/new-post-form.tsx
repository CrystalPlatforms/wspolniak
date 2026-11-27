// SPDX-License-Identifier: AGPL-3.0-or-later
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
	ComposerHeader,
	ComposerSubmitButton,
	ComposerToolbar,
} from "@/components/app/composer-chrome";
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
import {
	descriptionTooLongMessage,
	EMPTY_POST_MESSAGE,
	hasComposerContent,
	MAX_FILE_SIZE_MB,
	oversizedImageMessage,
	splitAttachmentFiles,
} from "@/components/app/composer-rules";
import type { Mention } from "@/components/app/mention-input";
import { OversizedImageDialog } from "@/components/app/oversized-image-dialog";
import { PostDescriptionField } from "@/components/app/post-description-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MAX_DESCRIPTION_LENGTH, postPollSchema } from "@/db/posts/schema";
import type { ImageUploadProgress } from "@/images/upload";
import { maybeIngestSharedFiles } from "@/lib/android-bridge";
import { takePendingFiles } from "@/lib/waiting-room";

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
	 * Wybór z „Dodaj załączniki" dzieli się po MIME na kafelki: zdjęcia, wideo
	 * (tytuł z nazwy pliku, upload do YouTube przy publikacji) i pliki (R2).
	 */
	const handleAttachmentsPicked = (incoming: File[]) => {
		const split = splitAttachmentFiles(incoming, {
			images: media.length,
			videos: pendingVideos.length,
			files: postFiles.length,
		});
		if (split.images.length > 0) setMedia([...media, ...split.images]);
		if (split.videos.length > 0) setPendingVideos([...pendingVideos, ...split.videos]);
		if (split.files.length > 0) setPostFiles([...postFiles, ...split.files]);
		// #250: ten sam komunikat (np. limit mediów) ma się pokazać raz, nie per odrzucony plik.
		setError(split.errors.length > 0 ? [...new Set(split.errors)].join(", ") : null);
	};

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const files = media.map((i) => i.file).filter((f): f is File => Boolean(f));
		const oversized = media.find((i) => i.isOversized && i.file);
		if (oversized?.file) {
			setError(oversizedImageMessage(oversized.file.name));
			setOversizedId(oversized.id);
			return;
		}
		if (description.length > MAX_DESCRIPTION_LENGTH) {
			setError(descriptionTooLongMessage(description.length));
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
			!hasComposerContent({
				description,
				images: media.length,
				videos: pendingVideos.length,
				files: postFiles.length,
				hasPoll: poll !== null,
				hasLocation: location !== null,
			})
		) {
			setError(EMPTY_POST_MESSAGE);
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
			hasComposerContent({
				description,
				images: media.length,
				videos: pendingVideos.length,
				files: postFiles.length,
				hasPoll: pollDraft !== null,
				hasLocation: locationDraft !== null,
			}) && !isSubmitting,
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
			<ComposerHeader title="Nowy post" onBack={onBack} backLabel="Wróć do feeda" />

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
			<ComposerToolbar
				onPickAttachments={handleAttachmentsPicked}
				onAddPoll={() => setPollDialogOpen(true)}
				onAddLocation={() => setLocationDialogOpen(true)}
				disabled={isSubmitting}
			/>

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

			<ComposerSubmitButton
				isSubmitting={isSubmitting}
				canSubmit={canSubmit}
				uploadProgress={uploadProgress}
				imageProgress={imageProgress}
				isSlowUpload={isSlowUpload}
				idleLabel="Opublikuj"
				busyLabel="Publikowanie..."
			/>
		</form>
	);
}
