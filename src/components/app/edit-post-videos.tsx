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
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ComposerVideoPicker, type PendingVideo } from "@/components/app/composer-video-picker";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { PostVideoEntry } from "@/db/posts/schema";
import { reorder } from "@/lib/reorder";

/** Wideo w edycji: `existing` (round-trip / usuwalne) albo `pending` (do wgrania przy zapisie). */
export interface VideoItem {
	key: string;
	existing?: PostVideoEntry;
	pending?: PendingVideo;
}

interface EditPostVideosProps {
	items: VideoItem[];
	onItemsChange: (items: VideoItem[]) => void;
	disabled?: boolean;
	/**
	 * Usunięcie ISTNIEJĄCEGO wideo (po potwierdzeniu) — route wywołuje YouTube
	 * delete dokładnie raz (fire-and-forget, #197).
	 */
	onVideoDelete?: (youtubeVideoId: string) => void;
}

const LISTBOX_ROLE = "listbox";
const OPTION_ROLE = "option";

interface SortableVideoItemProps {
	item: VideoItem;
	index: number;
	total: number;
	isOver: boolean;
	onRemoveRequest: (item: VideoItem) => void;
}

/** Karta wideo w unified liście edycji — istniejące z miniaturą YT, pending z blob preview. */
function SortableVideoItem({
	item,
	index,
	total,
	isOver,
	onRemoveRequest,
}: SortableVideoItemProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: item.key,
	});

	const style: React.CSSProperties = isDragging
		? {
				transform: CSS.Transform.toString(transform),
				transition,
				zIndex: 50,
			}
		: {};

	return (
		<li
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			role={OPTION_ROLE}
			tabIndex={0}
			className={`flex touch-none items-center gap-2 rounded-md border border-border bg-card p-2 ${isDragging ? "scale-90 opacity-80" : ""} ${isOver ? "rounded-md ring-4 ring-green-500 ring-offset-2" : ""}`}
		>
			{item.existing ? (
				<img
					src={item.existing.thumbnailUrl}
					alt={item.existing.title}
					className="h-14 w-24 shrink-0 rounded object-cover"
					loading="lazy"
				/>
			) : (
				<video
					src={item.pending?.preview}
					className="h-14 w-24 shrink-0 rounded object-cover"
					preload="metadata"
					muted
				/>
			)}
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium text-foreground">
					{item.existing?.title ?? item.pending?.title}
				</p>
				<p className="text-xs text-muted-foreground">
					{item.existing
						? `Wideo ${index + 1} z ${total} — istniejące`
						: `Wideo ${index + 1} z ${total} — wgra się przy zapisie`}
				</p>
			</div>
			<button
				type="button"
				aria-label="Usuń wideo"
				onClick={(e) => {
					e.stopPropagation();
					onRemoveRequest(item);
				}}
				onPointerDown={(e) => e.stopPropagation()}
				className="flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-90 transition-opacity hover:opacity-100"
			>
				<X className="size-3.5" />
			</button>
		</li>
	);
}

/**
 * Sekcja wideo formularza edycji (Video v2 F3 #197): ten sam flow dodawania co
 * w kompozytorze (file picker → tytuł → karta), unified lista istniejących i
 * nowych z drag & drop; × na istniejącym pyta o potwierdzenie i woła
 * `onVideoDelete` (YouTube delete dokładnie raz), × na nowym po prostu usuwa.
 */
export function EditPostVideos({
	items,
	onItemsChange,
	disabled = false,
	onVideoDelete,
}: EditPostVideosProps) {
	const [overId, setOverId] = useState<string | null>(null);
	// Confirm usuwania istniejącego wideo (us story 13, #197).
	const [removalCandidate, setRemovalCandidate] = useState<VideoItem | null>(null);

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

	const sortableIds = useMemo(() => items.map((v) => v.key), [items]);

	const handleDragStart = useCallback((_event: DragStartEvent) => {
		setOverId(null);
	}, []);

	const handleDragOver = useCallback((event: DragOverEvent) => {
		setOverId(event.over ? String(event.over.id) : null);
	}, []);

	const handleVideoDragEnd = useCallback(
		(event: DragEndEvent) => {
			setOverId(null);
			const { active, over } = event;
			if (!over || active.id === over.id) return;

			const activeIndex = items.findIndex((v) => v.key === String(active.id));
			const overIndex = items.findIndex((v) => v.key === String(over.id));
			if (activeIndex === -1 || overIndex === -1) return;

			onItemsChange(reorder(items, activeIndex, overIndex));
		},
		[items, onItemsChange],
	);

	/** Nowe wideo z pickera dopisuje się na koniec unified listy. */
	const handleVideosAdded = useCallback(
		(added: PendingVideo[]) => {
			onItemsChange([...items, ...added.map((p) => ({ key: p.key, pending: p }))]);
		},
		[items, onItemsChange],
	);

	const handleRemoveConfirmed = useCallback(() => {
		const item = removalCandidate;
		if (!item) return;
		if (item.existing) {
			// YouTube delete dokładnie raz — natychmiast po potwierdzeniu (#197).
			onVideoDelete?.(item.existing.youtubeVideoId);
		} else if (item.pending) {
			URL.revokeObjectURL(item.pending.preview);
		}
		onItemsChange(items.filter((v) => v.key !== item.key));
		setRemovalCandidate(null);
	}, [removalCandidate, onVideoDelete, items, onItemsChange]);

	return (
		<div className="space-y-2">
			<ComposerVideoPicker
				videos={[]}
				onChange={handleVideosAdded}
				count={items.length}
				disabled={disabled}
			/>

			{items.length > 0 && (
				<DndContext
					sensors={sensors}
					onDragStart={handleDragStart}
					onDragOver={handleDragOver}
					onDragEnd={handleVideoDragEnd}
				>
					<SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
						{/* Role przez zmienną — biome wycina statyczne role przy formacie. */}
						<ul role={LISTBOX_ROLE} className="space-y-2">
							{items.map((item, index) => (
								<SortableVideoItem
									key={item.key}
									item={item}
									index={index}
									total={items.length}
									isOver={overId === item.key}
									onRemoveRequest={setRemovalCandidate}
								/>
							))}
						</ul>
					</SortableContext>
				</DndContext>
			)}

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
						„{removalCandidate?.existing?.title ?? removalCandidate?.pending?.title}" zostanie
						usunięte z posta i z YouTube. Tej operacji nie można cofnąć.
					</p>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setRemovalCandidate(null)}>
							Anuluj
						</Button>
						<Button type="button" variant="destructive" onClick={handleRemoveConfirmed}>
							Usuń
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
