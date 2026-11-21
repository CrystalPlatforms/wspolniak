// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconAlertTriangle, IconPhotoPlus, IconX } from "@tabler/icons-react";
import { type ChangeEvent, type FormEvent, useCallback, useMemo, useRef, useState } from "react";
import { ComposerFilesSection } from "@/components/app/composer-files-section";
import {
	ComposerLocationDialog,
	type LocationDraft,
} from "@/components/app/composer-location-section";
import { EditPostVideos, type VideoItem } from "@/components/app/edit-post-videos";
import type { Mention } from "@/components/app/mention-input";
import { OversizedImageDialog } from "@/components/app/oversized-image-dialog";
import { PostDescriptionField } from "@/components/app/post-description-field";
import { PostPollSummary } from "@/components/app/post-poll";
import type { VideoPlanEntry } from "@/components/app/use-publish-post";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import type { FeatureFlags } from "@/db/instance";
import type { PostVideoEntry } from "@/db/posts/schema";
import { MAX_DESCRIPTION_LENGTH } from "@/db/posts/schema";
import { getImageUrl } from "@/images/client";
import { reorder } from "@/lib/reorder";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif";
const MAX_FILES = 10;
const MAX_FILE_SIZE_MB = 19;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export interface ExistingImage {
	id: string;
	cfImageId: string;
}

interface ImageItem {
	key: string;
	url: string;
	existingId?: string;
	fileIndex?: number;
	isOversized?: boolean;
}

const LISTBOX_ROLE = "listbox";
const OPTION_ROLE = "option";

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
	featureFlags?: FeatureFlags;
}

function SortablePreview({
	id,
	url,
	index,
	isOver,
	isOversized,
	fileName,
	onRemove,
	onOpenDetails,
}: {
	id: string;
	url: string;
	index: number;
	isOver: boolean;
	isOversized: boolean;
	fileName: string;
	onRemove: () => void;
	onOpenDetails: (id: string) => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id,
	});

	const style: React.CSSProperties = isDragging
		? {
				transform: CSS.Transform.toString(transform),
				transition,
				zIndex: 50,
			}
		: {};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			// Role przez zmienną — biome wycina statyczne role/tabIndex przy formacie.
			role={OPTION_ROLE}
			tabIndex={0}
			className={`relative aspect-square touch-none ${isDragging ? "scale-90 opacity-80" : ""} ${isOver ? "rounded-md ring-4 ring-green-500 ring-offset-2" : ""}`}
		>
			<img
				src={url}
				alt={`Podgląd ${index + 1}`}
				className="aspect-square w-full rounded-md object-cover"
			/>
			{isOversized && (
				<button
					type="button"
					aria-label={`Zdjęcie za duże: ${fileName}`}
					onClick={(e) => {
						e.stopPropagation();
						onOpenDetails(id);
					}}
					onPointerDown={(e) => e.stopPropagation()}
					className="absolute inset-0 flex items-center justify-center rounded-md bg-destructive/60"
				>
					<IconAlertTriangle className="size-8 text-destructive-foreground" aria-hidden="true" />
				</button>
			)}
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
				onPointerDown={(e) => e.stopPropagation()}
				className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-90 transition-opacity hover:opacity-100"
				title="Usuń zdjęcie"
			>
				<IconX className="h-3 w-3" aria-hidden="true" />
			</button>
		</div>
	);
}

/**
 * Plan zdjęć do zapisu: co usunięte, co nowe, jaka kolejność istniejących.
 * Zwykła funkcja (nie hook) — handleSubmit nie potrzebuje stabilnej referencji.
 */
function computeImagePlan(
	items: ImageItem[],
	existingImages: ExistingImage[],
	newFiles: File[],
): { removedImageIds: string[]; files: File[]; imageOrder: string[] } {
	const currentExistingIds = items.flatMap((item) => (item.existingId ? [item.existingId] : []));
	const removedImageIds = existingImages
		.filter((img) => !currentExistingIds.includes(img.id))
		.map((img) => img.id);
	const files = items
		.filter((item) => item.fileIndex !== undefined)
		.flatMap((item) => {
			const file = item.fileIndex !== undefined ? newFiles[item.fileIndex] : undefined;
			return file ? [file] : [];
		});
	return { removedImageIds, files, imageOrder: currentExistingIds };
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
}: EditPostFormProps) {
	const [description, setDescription] = useState(initialDescription ?? "");
	const [videoItems, setVideoItems] = useState<VideoItem[]>(() =>
		initialVideos.map((entry, index) => ({
			key: `ex-${index}-${entry.youtubeVideoId}`,
			existing: entry,
		})),
	);
	const [mentions, setMentions] = useState<Mention[]>([]);
	/** Lokalizacja (#242): szkic + flaga dotknięcia — bez dotknięcia PATCH nie wysyła pola. */
	const [locationDraft, setLocationDraft] = useState<LocationDraft | null>(
		initialLocation
			? { lat: initialLocation.lat, lng: initialLocation.lng, label: initialLocation.label ?? "" }
			: null,
	);
	const [locationTouched, setLocationTouched] = useState(false);
	const [locationDialogOpen, setLocationDialogOpen] = useState(false);
	/** Pliki (#243): id istniejących zostawionych + nowe pliki z wybierarki. */
	const [keptFileIds, setKeptFileIds] = useState<string[]>(initialFiles.map((f) => f.id));
	const [newPostFiles, setNewPostFiles] = useState<File[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [overId, setOverId] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Single unified list — same pattern as NewPostForm
	const [items, setItems] = useState<ImageItem[]>(
		existingImages.map((img) => ({
			key: `e-${img.id}`,
			url: getImageUrl({
				accountHash: imageAccountHash,
				cfImageId: img.cfImageId,
				variant: "thumbnail",
			}),
			existingId: img.id,
		})),
	);
	const [newFiles, setNewFiles] = useState<File[]>([]);

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

	const sortableIds = useMemo(() => items.map((item) => item.key), [items]);

	const handleDragStart = useCallback((_event: DragStartEvent) => {
		setOverId(null);
	}, []);

	const handleDragOver = useCallback((event: DragOverEvent) => {
		setOverId(event.over ? String(event.over.id) : null);
	}, []);

	const handleImageDragEnd = useCallback(
		(event: DragEndEvent) => {
			setOverId(null);
			const { active, over } = event;
			if (!over || active.id === over.id) return;

			const activeIndex = items.findIndex((item) => item.key === String(active.id));
			const overIndex = items.findIndex((item) => item.key === String(over.id));
			if (activeIndex === -1 || overIndex === -1) return;

			setItems((prev) => reorder(prev, activeIndex, overIndex));
		},
		[items],
	);

	const handleFileChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			const incoming = Array.from(e.target.files ?? []);
			if (incoming.length === 0) return;

			setError(null);

			if (items.length + incoming.length > MAX_FILES) {
				setError(`Maksymalnie ${MAX_FILES} zdjęć na post`);
				return;
			}

			// Za duże pliki NIE są odrzucane (issue #200): trafiają na listę jako
			// oflagowane (czerwony mini z wykrzyknikiem), dialog na klik je naprawia.
			const newItems: ImageItem[] = incoming.map((f, i) => ({
				key: `n-${newFiles.length + i}`,
				url: URL.createObjectURL(f),
				fileIndex: newFiles.length + i,
				isOversized: f.size > MAX_FILE_SIZE_BYTES,
			}));

			setItems((prev) => [...prev, ...newItems]);
			setNewFiles((prev) => [...prev, ...incoming]);

			if (fileInputRef.current) fileInputRef.current.value = "";
		},
		[items.length, newFiles.length],
	);

	const removeItem = useCallback(
		(index: number) => {
			const item = items[index];
			if (!item) return;

			// Revoke blob URL for new files
			if (item.fileIndex !== undefined) {
				URL.revokeObjectURL(item.url);
			}

			setItems((prev) => prev.filter((_, i) => i !== index));
		},
		[items],
	);

	const [oversizedKey, setOversizedKey] = useState<string | null>(null);

	/** Plik otwarty w dialogu „za duże zdjęcie" (issue #200). */
	const oversizedItem = items.find((item) => item.key === oversizedKey) ?? null;
	const oversizedFile =
		oversizedItem?.fileIndex !== undefined ? (newFiles[oversizedItem.fileIndex] ?? null) : null;

	/** Podmiana pliku po zmniejszeniu (issue #200): nowy podgląd, flaga zdjęta. */
	const replaceNewFile = useCallback((fileIndex: number, nextFile: File) => {
		setNewFiles((prev) => prev.map((file, i) => (i === fileIndex ? nextFile : file)));
		setItems((prev) =>
			prev.map((item) => {
				if (item.fileIndex !== fileIndex) return item;
				URL.revokeObjectURL(item.url);
				return {
					...item,
					url: URL.createObjectURL(nextFile),
					isOversized: nextFile.size > MAX_FILE_SIZE_BYTES,
				};
			}),
		);
	}, []);

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (description.trim() === "" && items.length === 0 && videoItems.length === 0) {
			setError("Dodaj tekst, zdjęcie lub wideo");
			return;
		}
		const oversizedItem = items.find((item) => item.isOversized && item.fileIndex !== undefined);
		if (oversizedItem?.fileIndex !== undefined) {
			const oversizedFile = newFiles[oversizedItem.fileIndex];
			if (oversizedFile) {
				setError(
					`Zdjęcie „${oversizedFile.name}" jest za duże — kliknij jego podgląd i zmniejsz je, albo usuń je przed publikacją.`,
				);
				// otwieramy od razu dialog problematycznego zdjęcia — skrócona ścieżka naprawy
				setOversizedKey(oversizedItem.key);
				return;
			}
		}
		if (description.length > MAX_DESCRIPTION_LENGTH) {
			setError(
				`Tekst posta jest za długi — limit to ${MAX_DESCRIPTION_LENGTH} znaków (wpisanych: ${description.length})`,
			);
			return;
		}

		const { removedImageIds, files, imageOrder } = computeImagePlan(
			items,
			existingImages,
			newFiles,
		);
		const videoPlan: VideoPlanEntry[] = videoItems.map((item) =>
			item.existing
				? { kind: "existing" as const, entry: item.existing }
				: {
						kind: "pending" as const,
						file: item.pending?.file as File,
						title: item.pending?.title as string,
					},
		);
		const validMentions = mentions.filter((m) => description.includes(`@${m.name}`));
		const location = resolveEditLocation(locationDraft, locationTouched);
		const keptFiles = initialFiles
			.filter((f) => keptFileIds.includes(f.id))
			.map(({ key, name, size, mimeType }) => ({ key, name, size, mimeType }));
		const filesDirty = keptFileIds.length !== initialFiles.length || newPostFiles.length > 0;

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

	const canSubmit = useMemo(
		() =>
			(items.length > 0 || description.trim().length > 0 || videoItems.length > 0) && !isSubmitting,
		[items.length, description, isSubmitting, videoItems.length],
	);

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
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

			{initialPoll && <PostPollSummary poll={initialPoll} />}

			<div>
				<input
					id="photos"
					ref={fileInputRef}
					type="file"
					accept={ACCEPTED_TYPES}
					multiple
					onChange={handleFileChange}
					className="hidden"
				/>
				{/* Zdjęcia pod przyciskiem zdjęć, wideo pod swoim — mirror kompozytora (reviza usera). */}
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
					<div className="space-y-2">
						<Button
							type="button"
							variant="outline"
							className="h-11 w-full sm:h-9"
							onClick={() => fileInputRef.current?.click()}
							disabled={items.length >= MAX_FILES}
							title={items.length > 0 ? `${items.length}/${MAX_FILES}` : "Dodaj zdjęcia"}
						>
							<IconPhotoPlus className="h-4 w-4" aria-hidden="true" />
							<span className="ml-2">
								{items.length > 0 ? `${items.length}/${MAX_FILES}` : "Dodaj zdjęcia"}
							</span>
						</Button>

						{items.length > 0 && (
							<DndContext
								sensors={sensors}
								onDragStart={handleDragStart}
								onDragOver={handleDragOver}
								onDragEnd={handleImageDragEnd}
							>
								<SortableContext items={sortableIds}>
									<div role={LISTBOX_ROLE} className="grid grid-cols-3 gap-2">
										{items.map((item, i) => (
											<SortablePreview
												key={item.key}
												id={item.key}
												url={item.url}
												index={i}
												isOver={overId === item.key}
												isOversized={item.isOversized ?? false}
												fileName={
													item.fileIndex !== undefined ? (newFiles[item.fileIndex]?.name ?? "") : ""
												}
												onRemove={() => removeItem(i)}
												onOpenDetails={setOversizedKey}
											/>
										))}
									</div>
								</SortableContext>
							</DndContext>
						)}
					</div>

					<EditPostVideos
						items={videoItems}
						onItemsChange={setVideoItems}
						disabled={isSubmitting}
						onVideoDelete={onVideoDelete}
					/>
				</div>
			</div>

			{/* Lokalizacja (#242, reviza usera): chip + dialog zamiast rozwiniętej sekcji. */}
			{locationDraft ? (
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={() => setLocationDialogOpen(true)}
						title="Kliknij, aby edytować"
						className="flex min-w-0 max-w-56 items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
					>
						<span className="truncate">
							{locationDraft.label.trim() ||
								`${locationDraft.lat.toFixed(5)}, ${locationDraft.lng.toFixed(5)}`}
						</span>
					</button>
					<button
						type="button"
						onClick={() => {
							setLocationDraft(null);
							setLocationTouched(true);
						}}
						aria-label="Usuń lokalizację"
						className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<IconX className="size-4" aria-hidden="true" />
					</button>
				</div>
			) : (
				<Button
					type="button"
					variant="outline"
					className="h-11 w-full sm:h-9"
					onClick={() => setLocationDialogOpen(true)}
				>
					Dodaj położenie
				</Button>
			)}

			<ComposerLocationDialog
				open={locationDialogOpen}
				onOpenChange={setLocationDialogOpen}
				value={locationDraft}
				onSave={(draft) => {
					setLocationDraft(draft);
					setLocationTouched(true);
				}}
			/>

			{/* Pliki (#243): istniejące jako lista z usuwaniem, nowe przez wybierarkę. */}
			<div className="space-y-2 rounded-md border border-border bg-card p-3">
				<p className="text-sm font-medium text-foreground">
					Pliki{" "}
					<span className="text-xs text-muted-foreground">
						{keptFileIds.length + newPostFiles.length}/5
					</span>
				</p>
				{initialFiles.filter((f) => keptFileIds.includes(f.id)).length > 0 && (
					<ul className="flex flex-col gap-1">
						{initialFiles
							.filter((f) => keptFileIds.includes(f.id))
							.map((file) => (
								<li
									key={file.id}
									className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5"
								>
									<span
										className="min-w-0 flex-1 truncate text-sm text-foreground"
										title={file.name}
									>
										{file.name}
									</span>
									<button
										type="button"
										aria-label={`Usuń plik ${file.name}`}
										onClick={() => setKeptFileIds(keptFileIds.filter((id) => id !== file.id))}
										className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
									>
										<IconX className="size-4" aria-hidden="true" />
									</button>
								</li>
							))}
					</ul>
				)}
				<ComposerFilesSection
					files={newPostFiles}
					onChange={setNewPostFiles}
					existingCount={keptFileIds.length}
				/>
			</div>

			{/* Dialog „za duże zdjęcie" (issue #200): błąd + akcja zmniejszenia. */}
			<OversizedImageDialog
				file={oversizedFile}
				limitMb={MAX_FILE_SIZE_MB}
				open={oversizedItem !== null}
				onOpenChange={(o) => {
					if (!o) setOversizedKey(null);
				}}
				onShrunk={(shrunkFile) => {
					if (oversizedItem?.fileIndex !== undefined) {
						replaceNewFile(oversizedItem.fileIndex, shrunkFile);
					}
					setOversizedKey(null);
				}}
			/>

			<Button type="submit" className="w-full" disabled={!canSubmit}>
				<Loader loading={isSubmitting} />
				{isSubmitting ? "Zapisywanie..." : "Zapisz zmiany"}
			</Button>
		</form>
	);
}
