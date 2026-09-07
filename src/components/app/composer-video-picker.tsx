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
import { Clapperboard, X } from "lucide-react";
import { type ChangeEvent, useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MAX_POST_VIDEOS } from "@/db/posts";
import { reorder } from "@/lib/reorder";

// Role ARIA przez zmienne — biome traktuje statyczne `role="option"/"listbox"`
// jako niepoprawne i usuwa atrybut przy formacie (patrz pamięć projektu).
const LISTBOX_ROLE = "listbox";
const OPTION_ROLE = "option";

/** Wideo oczekujące na upload przy publikacji (tylko stan klienta — refresh traci). */
export interface PendingVideo {
	key: string;
	file: File;
	title: string;
	/** Blob URL podglądu — tworzony przy dodaniu, zwalniany przy usunięciu. */
	preview: string;
}

interface ComposerVideoPickerProps {
	videos: PendingVideo[];
	onChange: (videos: PendingVideo[]) => void;
	disabled?: boolean;
	/**
	 * YouTube niepołączony (rozpoznany po błędzie upload-session 503): zamiast
	 * przycisku pokazujemy instrukcję admina (#194, user story 7).
	 */
	notConnected?: boolean;
}

interface SortableVideoCardProps {
	video: PendingVideo;
	index: number;
	total: number;
	disabled: boolean;
	isOver: boolean;
	onRemove: (key: string) => void;
}

/** Karta oczekującego wideo — cały kafel draggowalny (wzór SortablePreview zdjęć). */
function SortableVideoCard({
	video,
	index,
	total,
	disabled,
	isOver,
	onRemove,
}: SortableVideoCardProps) {
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
		<li
			ref={setNodeRef}
			style={style}
			{...(disabled ? {} : attributes)}
			{...(disabled ? {} : listeners)}
			// Role przez zmienną — biome wycina statyczne role/tabIndex przy formacie.
			role={OPTION_ROLE}
			tabIndex={0}
			className={`flex touch-none items-center gap-2 rounded-md border border-border bg-card p-2 ${isDragging ? "scale-90 opacity-80" : ""} ${isOver ? "rounded-md ring-4 ring-green-500 ring-offset-2" : ""}`}
		>
			<video
				src={video.preview}
				className="h-14 w-24 shrink-0 rounded object-cover"
				preload="metadata"
				muted
			/>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium text-foreground">{video.title}</p>
				<p className="text-xs text-muted-foreground">
					Wideo {index + 1} z {total} — wgra się przy publikacji
				</p>
			</div>
			<button
				type="button"
				aria-label="Usuń wideo"
				onClick={(e) => {
					e.stopPropagation();
					onRemove(video.key);
				}}
				onPointerDown={(e) => e.stopPropagation()}
				disabled={disabled}
				className="flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-90 transition-opacity hover:opacity-100"
			>
				<X className="size-3.5" />
			</button>
		</li>
	);
}

/**
 * „Dodaj wideo" w kompozytorze postów (Video v2 #194, F2): klik otwiera file
 * picker urządzenia, wybór pliku → mały dialog z tytułem (prefill z nazwy pliku,
 * bez opisu), potem wideo czeka w kompozytorze jako karta z lokalnym podglądem.
 * Kolejność zmienia się przeciąganiem (dnd-kit, jak zdjęcia); × usuwa bez sieci.
 * Limit 5 na post (walidacja także po stronie serwera). Wgrywanie zaczyna się
 * dopiero przy publikacji.
 */
export function ComposerVideoPicker({
	videos,
	onChange,
	disabled = false,
	notConnected = false,
}: ComposerVideoPickerProps) {
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const [title, setTitle] = useState("");
	const [overId, setOverId] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

	const sortableIds = videos.map((v) => v.key);

	const full = videos.length >= MAX_POST_VIDEOS;

	const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		// Prefill tytułu z nazwy pliku (bez rozszerzenia).
		setTitle(file.name.replace(/\.[^.]+$/, ""));
		setPendingFile(file);
		e.target.value = "";
	}, []);

	const confirmTitle = useCallback(() => {
		const file = pendingFile;
		const cleanTitle = title.trim();
		if (!file || !cleanTitle) return;
		const key = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
		onChange([...videos, { key, file, title: cleanTitle, preview: URL.createObjectURL(file) }]);
		setPendingFile(null);
		setTitle("");
	}, [pendingFile, title, videos, onChange]);

	const cancelTitle = useCallback(() => {
		setPendingFile(null);
		setTitle("");
	}, []);

	const removeVideo = useCallback(
		(key: string) => {
			const removed = videos.find((v) => v.key === key);
			if (removed) URL.revokeObjectURL(removed.preview);
			onChange(videos.filter((v) => v.key !== key));
		},
		[videos, onChange],
	);

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

			const activeIndex = videos.findIndex((v) => v.key === String(active.id));
			const overIndex = videos.findIndex((v) => v.key === String(over.id));
			if (activeIndex === -1 || overIndex === -1) return;

			onChange(reorder(videos, activeIndex, overIndex));
		},
		[videos, onChange],
	);

	if (notConnected) {
		return (
			<p className="flex h-11 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground sm:h-9">
				<Clapperboard className="size-4 shrink-0" />
				Podłącz YouTube w panelu admina
			</p>
		);
	}

	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				accept="video/*"
				onChange={handleFileChange}
				className="hidden"
			/>
			<Button
				type="button"
				variant="outline"
				className="h-11 w-full sm:h-9"
				onClick={() => fileInputRef.current?.click()}
				disabled={disabled || full}
				title={full ? `Limit to ${MAX_POST_VIDEOS} wideo na post` : "Dodaj wideo"}
			>
				<Clapperboard className="h-4 w-4" />
				<span className="ml-2">
					{videos.length > 0 ? `${videos.length}/${MAX_POST_VIDEOS}` : "Dodaj wideo"}
				</span>
			</Button>

			{videos.length > 0 && (
				<DndContext
					sensors={sensors}
					onDragStart={handleDragStart}
					onDragOver={handleDragOver}
					onDragEnd={handleDragEnd}
				>
					<SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
						{/* Przez zmienną — biome wycina statyczny atrybut (niepoprawna rola ARIA). */}
						<ul role={LISTBOX_ROLE} className="space-y-2">
							{videos.map((video, index) => (
								<SortableVideoCard
									key={video.key}
									video={video}
									index={index}
									total={videos.length}
									disabled={disabled}
									isOver={overId === video.key}
									onRemove={removeVideo}
								/>
							))}
						</ul>
					</SortableContext>
				</DndContext>
			)}

			<Dialog open={pendingFile !== null} onOpenChange={(open) => !open && cancelTitle()}>
				<DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
					<DialogHeader>
						<DialogTitle>Tytuł wideo</DialogTitle>
					</DialogHeader>
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						maxLength={100}
						placeholder="np. Wakacje nad morzem"
						onKeyDown={(e) => e.key === "Enter" && confirmTitle()}
					/>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={cancelTitle}>
							Anuluj
						</Button>
						<Button type="button" onClick={confirmTitle} disabled={!title.trim()}>
							Dodaj
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
