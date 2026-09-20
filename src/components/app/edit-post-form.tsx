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
import { AlertTriangle, ImagePlus, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useMemo, useRef, useState } from "react";
import { EditPostVideos, type VideoItem } from "@/components/app/edit-post-videos";
import type { Mention } from "@/components/app/mention-input";
import { OversizedImageDialog } from "@/components/app/oversized-image-dialog";
import { PostDescriptionField } from "@/components/app/post-description-field";
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
					<AlertTriangle className="size-8 text-destructive-foreground" />
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
				<X className="h-3 w-3" />
			</button>
		</div>
	);
}

export function EditPostForm({
	postId: _postId,
	description: initialDescription,
	existingImages,
	imageAccountHash,
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

	const handleSubmit = useCallback(
		(e: FormEvent) => {
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

			// Figure out what changed
			const currentExistingIds = items
				.filter((item) => item.existingId)
				.map((item) => item.existingId!);

			const removedImageIds = existingImages
				.filter((img) => !currentExistingIds.includes(img.id))
				.map((img) => img.id);

			const newFileItems = items.filter((item) => item.fileIndex !== undefined);
			const files = newFileItems.map((item) => newFiles[item.fileIndex!]).filter(Boolean);

			const imageOrder = currentExistingIds;

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
			onSubmit({
				description,
				files,
				removedImageIds,
				imageOrder,
				videoPlan,
				mentions: validMentions,
			});
		},
		[description, items, existingImages, newFiles, videoItems, onSubmit, mentions.filter],
	);

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
							<ImagePlus className="h-4 w-4" />
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
