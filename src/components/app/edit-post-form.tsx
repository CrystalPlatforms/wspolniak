// SPDX-License-Identifier: AGPL-3.0-or-later
import { type FormEvent, useMemo, useState } from "react";
import {
	ComposerHeader,
	ComposerSubmitButton,
	ComposerToolbar,
} from "@/components/app/composer-chrome";
import {
	ComposerAttachmentsGrid,
	type GridVideoItem,
	MAX_IMAGE_BYTES,
	type MediaItem,
} from "@/components/app/composer-image-grid";
import {
	ComposerLocationDialog,
	type LocationDraft,
} from "@/components/app/composer-location-section";
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
import { PostPollSummary } from "@/components/app/post-poll";
import type { VideoPlanEntry } from "@/components/app/use-publish-post";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { MAX_DESCRIPTION_LENGTH, type PostVideoEntry } from "@/db/posts/schema";
import { getImageUrl } from "@/images/client";
import type { ImageUploadProgress } from "@/images/upload";

export interface ExistingImage {
	id: string;
	cfImageId: string;
}

/** Wideo w edycji posta: istniejące na YouTube albo nowe, do wgrania przy zapisie. */
type EditVideoItem =
	| { key: string; kind: "existing"; entry: PostVideoEntry }
	| { key: string; kind: "pending"; file: File; title: string; preview: string };

type ExistingVideo = Extract<EditVideoItem, { kind: "existing" }>;

/** Plik w edycji posta: istniejący w R2 albo nowy, do wysłania przy zapisie. */
type EditFileItem =
	| { kind: "existing"; id: string; key: string; name: string; size: number; mimeType: string }
	| { kind: "new"; file: File };

interface EditPostFormProps {
	postId: string;
	description: string | null;
	existingImages: ExistingImage[];
	imageAccountHash: string;
	/** Ankieta posta (#241) — po publikacji tylko do czytania. */
	initialPoll?: { question: string; options: string[] } | null;
	/** Lokalizacja posta (#242) — edytowalna: zmiana pinezki/etykiety albo usunięcie. */
	initialLocation?: { lat: number; lng: number; label?: string } | null;
	/** Załączniki posta (#243) — można usuwać istniejące i dokładać nowe. */
	initialFiles?: { id: string; key: string; name: string; size: number; mimeType: string }[];
	/** Wideo posta — wchodzą do unified listy (reorder + remove, Video v2 F3 #197). */
	initialVideos?: PostVideoEntry[];
	onSubmit: (data: {
		description: string;
		files: File[];
		removedImageIds: string[];
		imageOrder: string[];
		/** Plan wideo wg kolejności listy: existing 1:1, pending wgrane przy zapisie. */
		videoPlan: VideoPlanEntry[];
		mentions: Mention[];
		/** Lokalizacja (#242): obiekt = ustaw, null = usuń, undefined = bez zmian. */
		location?: { lat: number; lng: number; label?: string } | null;
		/** Pliki (#243): metadane zostawionych istniejących + nowe pliki do uploadu. */
		keptFiles: { key: string; name: string; size: number; mimeType: string }[];
		newPostFiles: File[];
		/** Ktoś ruszył listę plików (usunięcie albo dokładka) — wtedy PATCH wysyła files. */
		filesDirty: boolean;
	}) => void;
	/**
	 * Usunięcie ISTNIEJĄCEGO wideo (po potwierdzeniu) — route wywołuje YouTube
	 * delete dokładnie raz (fire-and-forget, #197).
	 */
	onVideoDelete?: (youtubeVideoId: string) => void;
	isSubmitting: boolean;
	/** Strzałka „Wróć do posta" w nagłówku (rysowanym przez formie, jak w kompozytorze). */
	onBack?: () => void;
	/** Postęp uploadu wideo przy zapisie — label przycisku „Wideo 1/2 - 45%" (#194). */
	uploadProgress?: { videoIndex: number; total: number; percent: number } | null;
	/**
	 * Upload zdjęcia trwa dłużej niż 7 s (issue #199) — pokazujemy ostrzeżenie
	 * "wolne łącze" bez blokowania zapisu.
	 */
	isSlowUpload?: boolean;
	/** Postęp uploadu zdjęć z realnych bajtów ("Zdjęcie i/N - x%") — issue #203. */
	imageProgress?: ImageUploadProgress | null;
}

/**
 * Plan zdjęć do zapisu: co usunięte (istniejące, których nie ma na siatce), jakie
 * nowe pliki i jaka kolejność istniejących. Nowe wiersze powstają dopiero na
 * serwerze, więc `imageOrder` obejmuje tylko zdjęcia istniejące.
 * Zwykła funkcja (nie hook) — handleSubmit nie potrzebuje stabilnej referencji.
 */
function computeImagePlan(media: MediaItem[], existingImages: ExistingImage[]) {
	const removedImageIds = existingImages
		.filter((img) => !media.some((item) => item.existingId === img.id))
		.map((img) => img.id);
	const files = media.flatMap((item) => (item.file ? [item.file] : []));
	const imageOrder = media.flatMap((item) => (item.existingId ? [item.existingId] : []));
	return { removedImageIds, files, imageOrder };
}

/**
 * Lokalizacja do PATCH (#242): bez dotknięcia = undefined (pole nie leci),
 * dotknięta bez pinezki = null (usunięcie), z pinezką = nowy payload.
 */
function resolveEditLocation(
	draft: LocationDraft | null,
	touched: boolean,
): { lat: number; lng: number; label?: string } | null | undefined {
	if (!touched) return undefined;
	if (!draft || (draft.lat === 0 && draft.lng === 0)) return null;
	const label = draft.label.trim();
	return { lat: draft.lat, lng: draft.lng, ...(label ? { label } : {}) };
}

/**
 * Formularz edycji posta — ten sam kompozytor co tworzenie (#251): nagłówek,
 * pasek dodawania z jedną wybierarką, jednolita siatka kafelków i przycisk.
 * Rzeczy już istniejące w poście (zdjęcia, wideo, pliki, położenie) stoją na
 * siatce obok nowo dodanych; ankieta jest tylko do odczytu.
 */
export function EditPostForm({
	postId: _postId,
	description: initialDescription,
	existingImages,
	imageAccountHash,
	initialPoll = null,
	initialLocation = null,
	initialFiles = [],
	initialVideos = [],
	onSubmit,
	onVideoDelete,
	isSubmitting,
	onBack,
	uploadProgress = null,
	isSlowUpload = false,
	imageProgress = null,
}: EditPostFormProps) {
	const [description, setDescription] = useState(initialDescription ?? "");
	const [mentions, setMentions] = useState<Mention[]>([]);
	/** Zdjęcia na siatce: istniejące w poście (miniatura z CF Images) + nowe. */
	const [media, setMedia] = useState<MediaItem[]>(() =>
		existingImages.map((img) => ({
			id: `img-e-${img.id}`,
			existingId: img.id,
			preview: getImageUrl({
				accountHash: imageAccountHash,
				cfImageId: img.cfImageId,
				variant: "thumbnail",
			}),
		})),
	);
	const [videos, setVideos] = useState<EditVideoItem[]>(() =>
		initialVideos.map(
			(entry, index): EditVideoItem => ({
				key: `ex-${index}-${entry.youtubeVideoId}`,
				kind: "existing",
				entry,
			}),
		),
	);
	const [fileItems, setFileItems] = useState<EditFileItem[]>(() =>
		initialFiles.map(
			({ id, key, name, size, mimeType }): EditFileItem => ({
				kind: "existing",
				id,
				key,
				name,
				size,
				mimeType,
			}),
		),
	);
	/** Lokalizacja (#242): szkic + flaga dotknięcia — bez dotknięcia PATCH nie wysyła pola. */
	const [locationDraft, setLocationDraft] = useState<LocationDraft | null>(
		initialLocation
			? { lat: initialLocation.lat, lng: initialLocation.lng, label: initialLocation.label ?? "" }
			: null,
	);
	const [locationTouched, setLocationTouched] = useState(false);
	const [locationDialogOpen, setLocationDialogOpen] = useState(false);
	const [pollDialogOpen, setPollDialogOpen] = useState(false);
	/** Istniejące wideo do usunięcia — czeka na potwierdzenie w dialogu. */
	const [removalCandidate, setRemovalCandidate] = useState<ExistingVideo | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [oversizedId, setOversizedId] = useState<string | null>(null);

	/** Plik otwarty w dialogu „za duże zdjęcie" (issue #200). */
	const oversizedItem = media.find((item) => item.id === oversizedId) ?? null;

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
	 * Wybór z „Dodaj załączniki" dzieli się po MIME jak w kompozytorze; limity
	 * liczą razem z tym, co już jest w poście.
	 */
	const handlePickAttachments = (incoming: File[]) => {
		const split = splitAttachmentFiles(incoming, {
			images: media.length,
			videos: videos.length,
			files: fileItems.length,
		});
		if (split.images.length > 0) setMedia([...media, ...split.images]);
		if (split.videos.length > 0) {
			setVideos([
				...videos,
				...split.videos.map(
					(video): EditVideoItem => ({
						key: video.key,
						kind: "pending",
						file: video.file,
						title: video.title,
						preview: video.preview,
					}),
				),
			]);
		}
		if (split.files.length > 0) {
			setFileItems([
				...fileItems,
				...split.files.map((file): EditFileItem => ({ kind: "new", file })),
			]);
		}
		// #250: ten sam komunikat (np. limit mediów) ma się pokazać raz, nie per odrzucony plik.
		setError(split.errors.length > 0 ? [...new Set(split.errors)].join(", ") : null);
	};

	/** Wideo znika z listy (blob podglądu zwolniony); nowego nie ma czego potwierdzać. */
	const requestRemoveVideo = (key: string) => {
		const item = videos.find((video) => video.key === key);
		if (!item) return;
		if (item.kind === "existing") {
			setRemovalCandidate(item);
			return;
		}
		URL.revokeObjectURL(item.preview);
		setVideos(videos.filter((video) => video.key !== key));
	};

	/** Potwierdzenie usunięcia ISTNIEJĄCEGO wideo: YouTube delete dokładnie raz (#197). */
	const confirmRemoveVideo = () => {
		const item = removalCandidate;
		if (!item) return;
		onVideoDelete?.(item.entry.youtubeVideoId);
		setVideos(videos.filter((video) => video.key !== item.key));
		setRemovalCandidate(null);
	};

	/** Czy post ma jakąkolwiek treść — ta sama reguła co w kompozytorze (#251). */
	const hasContent = useMemo(
		() =>
			hasComposerContent({
				description,
				images: media.length,
				videos: videos.length,
				files: fileItems.length,
				hasPoll: initialPoll !== null,
				hasLocation: locationDraft !== null,
			}),
		[description, media.length, videos.length, fileItems.length, initialPoll, locationDraft],
	);

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (!hasContent) {
			setError(EMPTY_POST_MESSAGE);
			return;
		}
		const oversized = media.find((item) => item.isOversized && item.file);
		if (oversized?.file) {
			setError(oversizedImageMessage(oversized.file.name));
			// otwieramy od razu dialog problematycznego zdjęcia — skrócona ścieżka naprawy
			setOversizedId(oversized.id);
			return;
		}
		if (description.length > MAX_DESCRIPTION_LENGTH) {
			setError(descriptionTooLongMessage(description.length));
			return;
		}

		const { removedImageIds, files, imageOrder } = computeImagePlan(media, existingImages);
		const videoPlan = videos.map(
			(item): VideoPlanEntry =>
				item.kind === "existing"
					? { kind: "existing", entry: item.entry }
					: { kind: "pending", file: item.file, title: item.title },
		);
		const validMentions = mentions.filter((m) => description.includes(`@${m.name}`));
		const location = resolveEditLocation(locationDraft, locationTouched);
		const keptFiles = fileItems.flatMap((item) =>
			item.kind === "existing"
				? [{ key: item.key, name: item.name, size: item.size, mimeType: item.mimeType }]
				: [],
		);
		const newPostFiles = fileItems.flatMap((item) => (item.kind === "new" ? [item.file] : []));
		const filesDirty = keptFiles.length !== initialFiles.length || newPostFiles.length > 0;

		onSubmit({
			description,
			files,
			removedImageIds,
			imageOrder,
			videoPlan,
			mentions: validMentions,
			location,
			keptFiles,
			newPostFiles,
			filesDirty,
		});
	};

	const canSubmit = useMemo(() => hasContent && !isSubmitting, [hasContent, isSubmitting]);

	const gridVideos: GridVideoItem[] = videos.map((item) =>
		item.kind === "existing"
			? { key: item.key, title: item.entry.title, thumbnailUrl: item.entry.thumbnailUrl }
			: { key: item.key, title: item.title, preview: item.preview },
	);

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<ComposerHeader title="Edytuj post" onBack={onBack} backLabel="Wróć do posta" />

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

			{/* Pasek dodawania jak w kompozytorze: 3 przyciski w jednej linii i jedna
			    wybierarka na wszystko (#251). */}
			<ComposerToolbar
				onPickAttachments={handlePickAttachments}
				pollUnavailableReason="Ankiety nie można dodać ani zmienić po opublikowaniu posta"
				onAddLocation={() => setLocationDialogOpen(true)}
				disabled={isSubmitting}
			/>

			{/* Jednolita siatka kafelków: zdjęcia, wideo, pliki, ankieta i położenie —
			    istniejące w poście i nowo dodane obok siebie. */}
			{(media.length > 0 ||
				videos.length > 0 ||
				fileItems.length > 0 ||
				initialPoll ||
				locationDraft) && (
				<ComposerAttachmentsGrid
					images={media}
					onImagesChange={setMedia}
					onOpenDetails={setOversizedId}
					videos={gridVideos}
					onRemoveVideo={requestRemoveVideo}
					onReorderVideos={(keys) =>
						setVideos(
							keys.flatMap((key) => {
								const item = videos.find((video) => video.key === key);
								return item ? [item] : [];
							}),
						)
					}
					files={fileItems.map((item) =>
						item.kind === "existing" ? { name: item.name } : item.file,
					)}
					onRemoveFile={(index) => setFileItems(fileItems.filter((_, i) => i !== index))}
					poll={initialPoll ? { question: initialPoll.question } : null}
					onEditPoll={() => setPollDialogOpen(true)}
					onEditLocation={() => setLocationDialogOpen(true)}
					onRemoveLocation={() => {
						setLocationDraft(null);
						setLocationTouched(true);
					}}
					location={locationDraft}
				/>
			)}

			{/* Dialog „za duże zdjęcie" (issue #200): błąd + akcja zmniejszenia. */}
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

			{/* Lokalizacja (#242, reviza usera): dialog z mapą, kafelek edytuje się po kliku. */}
			<ComposerLocationDialog
				open={locationDialogOpen}
				onOpenChange={setLocationDialogOpen}
				value={locationDraft}
				onSave={(draft) => {
					setLocationDraft(draft);
					setLocationTouched(true);
				}}
			/>

			{/* Ankieta (#241): po publikacji tylko do odczytu — kafelek pokazuje treść. */}
			<Dialog open={pollDialogOpen} onOpenChange={setPollDialogOpen}>
				<DialogContent className="sm:max-w-md" aria-describedby={undefined}>
					<DialogHeader>
						<DialogTitle>Ankieta</DialogTitle>
					</DialogHeader>
					{initialPoll && <PostPollSummary poll={initialPoll} />}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setPollDialogOpen(false)}>
							Zamknij
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Confirm usunięcia istniejącego wideo (us story 13, #197). */}
			<Dialog
				open={removalCandidate !== null}
				onOpenChange={(open) => !open && setRemovalCandidate(null)}
			>
				<DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
					<DialogHeader>
						<DialogTitle>Usunąć wideo?</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-muted-foreground">
						„{removalCandidate?.entry.title}" zostanie usunięte z posta i z YouTube. Tej operacji
						nie można cofnąć.
					</p>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setRemovalCandidate(null)}>
							Anuluj
						</Button>
						<Button type="button" variant="destructive" onClick={confirmRemoveVideo}>
							Usuń
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<ComposerSubmitButton
				isSubmitting={isSubmitting}
				canSubmit={canSubmit}
				uploadProgress={uploadProgress}
				imageProgress={imageProgress}
				isSlowUpload={isSlowUpload}
				idleLabel="Zapisz zmiany"
				busyLabel="Zapisywanie..."
			/>
		</form>
	);
}
