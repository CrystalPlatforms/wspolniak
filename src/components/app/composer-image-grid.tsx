// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconAlertTriangle, IconChartBar, IconFile, IconMapPin, IconX } from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { reorder } from "@/lib/reorder";

/** Twardy limit CF Images na obraz (19 MB) — flaga "za duże" (issue #200). */
export const MAX_IMAGE_BYTES = 19 * 1024 * 1024;

export interface MediaItem {
	id: string;
	file?: File;
	/**
	 * Podgląd: URL.createObjectURL dla nowego pliku (zwalnia removeImage/
	 * replaceMediaFile) albo URL miniatury z Cloudflare Images dla zdjęcia,
	 * które już jest w poście.
	 */
	preview?: string;
	isOversized?: boolean;
	/** Id wiersza zdjęcia w bazie — tylko zdjęcia istniejące w poście (edycja, #251). */
	existingId?: string;
}

/** Wideo oczekujące na upload do YouTube przy publikacji (tylko stan klienta). */
export interface VideoDraft {
	key: string;
	file: File;
	title: string;
	preview: string;
}

/**
 * Kafelek wideo w siatce: nowe wideo ma podgląd `preview` (blob), a wideo
 * istniejące w poście — `thumbnailUrl` z YouTube.
 */
export interface GridVideoItem {
	key: string;
	title: string;
	preview?: string;
	thumbnailUrl?: string;
}

export interface ComposerAttachmentsGridProps {
	images: MediaItem[];
	onImagesChange: (next: MediaItem[]) => void;
	onOpenDetails: (id: string) => void;
	videos: GridVideoItem[];
	onRemoveVideo: (key: string) => void;
	/**
	 * Podana = kafelki wideo można przestawiać przeciąganiem (kolejność
	 * odtwarzania — edycja posta). Bez niej wideo stoją w kolejności dodania.
	 */
	onReorderVideos?: (keys: string[]) => void;
	files: { name: string }[];
	onRemoveFile: (index: number) => void;
	poll: { question: string } | null;
	onEditPoll: () => void;
	/** Brak = ankieta tylko do odczytu: kafelek bez krzyżyka (edycja posta). */
	onRemovePoll?: () => void;
	location: { lat: number; lng: number; label: string } | null;
	onEditLocation: () => void;
	onRemoveLocation: () => void;
}

/** Karta zdjęcia: podgląd + krzyżyk usuwania + flaga "za duże" (klik = dialog). */
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
			role="option"
			tabIndex={0}
			className={`relative touch-none aspect-square ${isDragging ? "scale-90 opacity-80" : ""} ${isOver ? "ring-4 ring-green-500 ring-offset-2 rounded-md" : ""}`}
		>
			<img src={url} alt={`Podgląd ${index + 1}`} className="w-full rounded-md object-cover" />
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

/** Kwadratowy kafelek (ikona + podpis) — ankieta/położenie/plik. */
function SquareTile({
	icon: Icon,
	title,
	subtitle,
	ariaLabel,
	hint,
	onOpen,
	onRemove,
}: {
	icon: typeof IconFile;
	title: string;
	subtitle?: string;
	ariaLabel: string;
	/** Podpowiedź po najecheniu — domyślnie „Kliknij, aby edytować”. */
	hint?: string;
	onOpen: () => void;
	/** Brak = kafelka nie da się usunąć (bez krzyżyka). */
	onRemove?: () => void;
}) {
	return (
		<div className="relative aspect-square">
			<button
				type="button"
				onClick={onOpen}
				aria-label={ariaLabel}
				title={hint ?? "Kliknij, aby edytować"}
				className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-md border border-border bg-muted/40 p-2 text-foreground transition-colors hover:bg-accent"
			>
				<Icon className="size-10 shrink-0 text-muted-foreground" aria-hidden="true" />
				<span className="w-full truncate text-center text-xs font-medium">{title}</span>
				{subtitle ? (
					<span className="w-full truncate text-center text-[10px] text-muted-foreground">
						{subtitle}
					</span>
				) : null}
			</button>
			{onRemove && (
				<button
					type="button"
					onClick={onRemove}
					aria-label={`Usuń ${title}`}
					className="absolute right-1 top-1 z-10 flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-90 transition-opacity hover:opacity-100"
					title="Usuń"
				>
					<IconX className="h-3 w-3" aria-hidden="true" />
				</button>
			)}
		</div>
	);
}

/**
 * Treść kafelka wideo: podgląd (nowe) albo miniatura YouTube (istniejące),
 * tytuł i krzyżyk. Krzyżyk nie budzi przeciągania (stopPropagation jak przy zdjęciach).
 */
function VideoTileBody({ video, onRemove }: { video: GridVideoItem; onRemove: () => void }) {
	return (
		<>
			{video.thumbnailUrl ? (
				<img
					src={video.thumbnailUrl}
					alt=""
					className="h-full w-full rounded-md object-cover"
					loading="lazy"
				/>
			) : (
				<video
					src={video.preview}
					className="h-full w-full rounded-md object-cover"
					preload="metadata"
					muted
				/>
			)}
			<span className="absolute bottom-1 left-1 right-1 truncate rounded bg-background/80 px-1 text-[10px] text-foreground">
				{video.title}
			</span>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
				onPointerDown={(e) => e.stopPropagation()}
				aria-label={`Usuń wideo ${video.title}`}
				className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-90 transition-opacity hover:opacity-100"
				title="Usuń wideo"
			>
				<IconX className="h-3 w-3" aria-hidden="true" />
			</button>
		</>
	);
}

/** Kafelek wideo w kolejności dodania. */
function VideoTile({ video, onRemove }: { video: GridVideoItem; onRemove: () => void }) {
	return (
		<div className="relative aspect-square">
			<VideoTileBody video={video} onRemove={onRemove} />
		</div>
	);
}

/** Kafelek wideo przestawialny przeciąganiem (wzór SortablePreview zdjęć). */
function SortableVideoTile({
	video,
	isOver,
	onRemove,
}: {
	video: GridVideoItem;
	isOver: boolean;
	onRemove: () => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: video.key,
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
			<VideoTileBody video={video} onRemove={onRemove} />
		</div>
	);
}

/** Kafelek pliku: ikona + nazwa + krzyżyk. */
function FileTile({ file, onRemove }: { file: { name: string }; onRemove: () => void }) {
	return (
		<div className="relative aspect-square">
			<div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-md border border-border bg-muted/40 p-2">
				<IconFile className="size-10 shrink-0 text-muted-foreground" aria-hidden="true" />
				<span
					className="w-full truncate text-center text-xs font-medium text-foreground"
					title={file.name}
				>
					{file.name}
				</span>
			</div>
			<button
				type="button"
				onClick={onRemove}
				aria-label={`Usuń plik ${file.name}`}
				className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-90 transition-opacity hover:opacity-100"
				title="Usuń plik"
			>
				<IconX className="h-3 w-3" aria-hidden="true" />
			</button>
		</div>
	);
}

/**
 * Jednolita siatka załączników kompozytora (reviza usera): WSZYSTKO co dodane
 * — zdjęcia, wideo, pliki, ankieta i położenie — to kwadratowe kafelki z X.
 * Zdjęcia sortują się dragiem między sobą; ankieta/położenie po kliku otwierają
 * swój dialog do edycji. W edycji posta (#251) ta sama siatka pokazuje rzeczy
 * już istniejące w poście: zdjęcia z bazy, wideo z YouTube, pliki i ankietę
 * (tylko do odczytu — bez krzyżyka).
 */
export function ComposerAttachmentsGrid({
	images,
	onImagesChange,
	onOpenDetails,
	videos,
	onRemoveVideo,
	onReorderVideos,
	files,
	onRemoveFile,
	poll,
	onEditPoll,
	onRemovePoll,
	location,
	onEditLocation,
	onRemoveLocation,
}: ComposerAttachmentsGridProps) {
	const [overId, setOverId] = useState<string | null>(null);
	// Mysz i dotyk przeciągają po ruchu > 5 px (klik w krzyżyk nie budzi sortowania);
	// klawiatura to alternatywa dla gestu: Enter na kafelku startuje, strzałki
	// przesuwają, Enter potwierdza, Escape anuluje.
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);
	const sortableIds = [
		...images.map((m) => m.id),
		...(onReorderVideos ? videos.map((video) => video.key) : []),
	];

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
			// Wideo przestawia się tylko między wideo (kolejność odtwarzania).
			if (onReorderVideos && videos.some((video) => video.key === active.id)) {
				const from = videos.findIndex((video) => video.key === active.id);
				const to = videos.findIndex((video) => video.key === over.id);
				if (from === -1 || to === -1) return;
				onReorderVideos(reorder(videos, from, to).map((video) => video.key));
				return;
			}
			const from = images.findIndex((m) => m.id === active.id);
			const to = images.findIndex((m) => m.id === over.id);
			if (from === -1 || to === -1) return;
			onImagesChange(reorder(images, from, to));
		},
		[images, onImagesChange, onReorderVideos, videos],
	);

	const removeImage = (id: string) => {
		const item = images.find((m) => m.id === id);
		if (item?.preview) URL.revokeObjectURL(item.preview);
		onImagesChange(images.filter((m) => m.id !== id));
	};

	return (
		<DndContext
			sensors={sensors}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
		>
			<SortableContext items={sortableIds} strategy={rectSortingStrategy}>
				<div role="listbox" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
					{images.map((item, index) => (
						<SortablePreview
							key={item.id}
							id={item.id}
							url={item.preview ?? ""}
							index={index}
							isOver={overId === item.id}
							isOversized={item.isOversized ?? false}
							fileName={item.file?.name ?? ""}
							onRemove={() => removeImage(item.id)}
							onOpenDetails={onOpenDetails}
						/>
					))}

					{videos.map((video) =>
						onReorderVideos ? (
							<SortableVideoTile
								key={video.key}
								video={video}
								isOver={overId === video.key}
								onRemove={() => onRemoveVideo(video.key)}
							/>
						) : (
							<VideoTile key={video.key} video={video} onRemove={() => onRemoveVideo(video.key)} />
						),
					)}

					{files.map((file, index) => (
						<FileTile
							key={`${file.name}-${index}`}
							file={file}
							onRemove={() => onRemoveFile(index)}
						/>
					))}

					{poll && (
						<SquareTile
							icon={IconChartBar}
							title={poll.question.trim() || "Ankieta"}
							ariaLabel={
								onRemovePoll
									? `Edytuj ankietę: ${poll.question.trim() || ""}`
									: `Ankieta (tylko do odczytu): ${poll.question.trim() || ""}`
							}
							hint={onRemovePoll ? undefined : "Ankiety nie można edytować po publikacji posta"}
							onOpen={onEditPoll}
							onRemove={onRemovePoll}
						/>
					)}
					{location && (
						<SquareTile
							icon={IconMapPin}
							title={location.label.trim() || "Położenie"}
							subtitle={`${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}`}
							ariaLabel={`Edytuj położenie: ${location.label.trim() || `${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}`}`}
							onOpen={onEditLocation}
							onRemove={onRemoveLocation}
						/>
					)}
				</div>
			</SortableContext>
		</DndContext>
	);
}

/** Plik -> element listy zdjęć (podgląd + flaga "za duże"). */
export function toMediaItem(file: File, index: number): MediaItem {
	return {
		id: `img-${Date.now()}-${index}`,
		file,
		preview: URL.createObjectURL(file),
		isOversized: file.size > MAX_IMAGE_BYTES,
	};
}
