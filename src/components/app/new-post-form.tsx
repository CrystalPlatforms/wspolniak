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
import { rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ImagePlus, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useMemo, useRef, useState } from "react";
import { FormattingToolbar } from "@/components/app/formatting-toolbar";
import { type Mention, MentionInput } from "@/components/app/mention-input";
import { PostVideoPicker } from "@/components/app/post-video-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { reorder } from "@/lib/reorder";

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif";
const MAX_IMAGES = 10;
const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface NewPostFormProps {
	onSubmit: (data: {
		description: string;
		files: File[];
		videoIds: string[];
		mentions: Mention[];
	}) => void;
	isSubmitting: boolean;
}

interface MediaItem {
	id: string;
	file?: File;
	preview?: string;
}

function SortablePreview({
	id,
	url,
	index,
	isOver,
	onRemove,
}: {
	id: string;
	url: string;
	index: number;
	isOver: boolean;
	onRemove: () => void;
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
			role="option"
			tabIndex={0}
			className={`relative touch-none aspect-square ${isDragging ? "scale-90 opacity-80" : ""} ${isOver ? "ring-4 ring-green-500 ring-offset-2 rounded-md" : ""}`}
		>
			<img src={url} alt={`Podgląd ${index + 1}`} className="w-full rounded-md object-cover" />
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
				onPointerDown={(e) => e.stopPropagation()}
				className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-90 transition-opacity hover:opacity-100"
				title="Usuń"
			>
				<X className="h-3 w-3" />
			</button>
		</div>
	);
}

export function NewPostForm({ onSubmit, isSubmitting }: NewPostFormProps) {
	const [description, setDescription] = useState("");
	const descriptionRef = useRef<HTMLTextAreaElement>(null);
	const [mentions, setMentions] = useState<Mention[]>([]);
	const [media, setMedia] = useState<MediaItem[]>([]);
	const [videoIds, setVideoIds] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [overId, setOverId] = useState<string | null>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);

	const images = useMemo(() => media, [media]);

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

	const sortableIds = useMemo(() => media.map((m) => m.id), [media]);

	const handleDragStart = useCallback((_event: DragStartEvent) => {
		setOverId(null);
	}, []);

	const handleDragOver = useCallback((event: DragOverEvent) => {
		setOverId(event.over ? String(event.over.id) : null);
	}, []);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			setOverId(null);
			const { active, over } = event;
			if (!over || active.id === over.id) return;

			const activeIndex = media.findIndex((m) => m.id === active.id);
			const overIndex = media.findIndex((m) => m.id === over.id);

			setMedia((prev) => reorder(prev, activeIndex, overIndex));
		},
		[media],
	);

	const handleImageFileChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			const incoming = Array.from(e.target.files ?? []);
			if (incoming.length === 0) return;

			setError(null);

			const oversized = incoming.find((f) => f.size > MAX_FILE_SIZE_BYTES);
			if (oversized) {
				setError(`Plik "${oversized.name}" przekracza ${MAX_FILE_SIZE_MB} MB`);
				return;
			}

			if (images.length + incoming.length > MAX_IMAGES) {
				setError(`Maksymalnie ${MAX_IMAGES} zdjęć na post`);
				return;
			}

			const newItems: MediaItem[] = incoming.map((file, i) => {
				const preview = URL.createObjectURL(file);
				return {
					id: `img-${Date.now()}-${i}`,
					file,
					preview,
				};
			});

			setMedia((prev) => [...prev, ...newItems]);

			if (imageInputRef.current) imageInputRef.current.value = "";
		},
		[images.length],
	);

	const removeMedia = useCallback((id: string) => {
		setMedia((prev) => {
			const item = prev.find((m) => m.id === id);
			if (item?.preview) {
				URL.revokeObjectURL(item.preview);
			}
			const filtered = prev.filter((m) => m.id !== id);
			if (filtered.length === 0) {
				if (imageInputRef.current) imageInputRef.current.value = "";
			}
			return filtered;
		});
	}, []);

	const handleSubmit = useCallback(
		(e: FormEvent) => {
			e.preventDefault();
			if (images.length === 0 && videoIds.length === 0 && !description.trim()) {
				setError("Dodaj tekst, zdjęcie lub wideo");
				return;
			}
			const files = images.map((i) => i.file!).filter(Boolean);
			const validMentions = mentions.filter((m) => description.includes(`@${m.name}`));
			onSubmit({
				description,
				files,
				videoIds,
				mentions: validMentions,
			});
		},
		[description, images, onSubmit, mentions.filter, videoIds],
	);

	const canSubmit = useMemo(() => {
		return (
			(images.length > 0 || videoIds.length > 0 || description.trim().length > 0) && !isSubmitting
		);
	}, [images.length, description, isSubmitting, videoIds.length]);

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<div className="space-y-2">
				<Label htmlFor="description">Tekst</Label>
				<FormattingToolbar
					textareaRef={descriptionRef}
					value={description}
					onChange={setDescription}
				/>
				<MentionInput
					textareaRef={descriptionRef}
					id="description"
					value={description}
					onChange={setDescription}
					onMentionsChange={setMentions}
					placeholder="Co się wydarzyło? (@aby kogoś oznaczyć)"
					maxLength={2000}
					rows={6}
					className="min-h-36 resize-y"
				/>
			</div>

			<div>
				<input
					ref={imageInputRef}
					type="file"
					accept={ACCEPTED_IMAGE_TYPES}
					multiple
					onChange={handleImageFileChange}
					className="hidden"
				/>
				<Button
					type="button"
					variant="outline"
					className="h-11 w-full sm:h-9"
					onClick={() => imageInputRef.current?.click()}
					disabled={images.length >= MAX_IMAGES}
					title={images.length > 0 ? `${images.length}/${MAX_IMAGES}` : "Dodaj zdjęcia"}
				>
					<ImagePlus className="h-4 w-4" />
					{images.length > 0 ? (
						<span className="ml-2">
							{images.length}/{MAX_IMAGES}
						</span>
					) : (
						<span className="ml-2">Zdjęcia</span>
					)}
				</Button>
			</div>

			<PostVideoPicker videoIds={videoIds} onChange={setVideoIds} disabled={isSubmitting} />

			{media.length > 0 && (
				<DndContext
					sensors={sensors}
					onDragStart={handleDragStart}
					onDragOver={handleDragOver}
					onDragEnd={handleDragEnd}
				>
					<SortableContext items={sortableIds} strategy={rectSortingStrategy}>
						<div role="listbox" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
							{media.map((item, index) => (
								<SortablePreview
									key={item.id}
									id={item.id}
									url={item.preview ?? ""}
									index={index}
									isOver={overId === item.id}
									onRemove={() => removeMedia(item.id)}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			)}

			<Button
				type="submit"
				className="relative h-11 w-full overflow-hidden sm:h-9"
				disabled={!canSubmit}
			>
				{isSubmitting ? (
					<span
						aria-hidden
						className="absolute inset-0 origin-left animate-[publish-indeterminate_7s_ease-out_forwards] bg-primary-foreground/20"
					/>
				) : null}
				<span className="relative">{isSubmitting ? "Publikowanie..." : "Opublikuj"}</span>
			</Button>
		</form>
	);
}
