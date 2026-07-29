// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Film, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { getVideoFeedPage } from "@/core/functions/video-feed";
import type { VideoFeedItem } from "@/db/videos";

interface PostVideoPickerProps {
	/** Uporządkowana lista identyfikatorów wideo przypiętych do posta. */
	videoIds: string[];
	onChange: (videoIds: string[]) => void;
	disabled?: boolean;
}

const MAX_VIDEOS = 10;

/**
 * Picker wideo w kompozytorze posta (F5). Lista dostępnych wideo z `/video`
 * w Dialogu; klik = dodaj w kolejności dodawania. Wybrane wideo mają
 * usuwanie + góra/dół (zmina kolejności aktualizuje `position`).
 *
 * `videoIds` (kolejność) jest jedynym źródłem prawdy — zmiana woła `onChange`.
 */
export function PostVideoPicker({ videoIds, onChange, disabled }: PostVideoPickerProps) {
	const { data } = useQuery({
		queryKey: ["videos", "picker"],
		queryFn: async () => {
			const page = await getVideoFeedPage({ data: {} });
			return (page as unknown as { data: VideoFeedItem[] }).data;
		},
	});

	const available = data ?? [];
	const selectedSet = new Set(videoIds);
	const selectedVideos = videoIds
		.map((id) => available.find((v) => v.id === id))
		.filter((v): v is VideoFeedItem => Boolean(v));
	const pickable = available.filter((v) => !selectedSet.has(v.id));
	const limitReached = videoIds.length >= MAX_VIDEOS;

	const add = (id: string) => {
		if (videoIds.includes(id) || limitReached) return;
		onChange([...videoIds, id]);
	};
	const remove = (id: string) => onChange(videoIds.filter((v) => v !== id));
	const move = (index: number, dir: -1 | 1) => {
		const target = index + dir;
		if (target < 0 || target >= videoIds.length) return;
		const next = [...videoIds];
		[next[index], next[target]] = [next[target] as string, next[index] as string];
		onChange(next);
	};

	// Fragment (bez wrappera): trigger wpasowuje się do gridu kompozytora obok
	// przycisku zdjęć, a lista wybranych (`col-span-full`) rozkłada się pod oboma.
	return (
		<>
			<Dialog>
				<DialogTrigger asChild>
					<Button
						type="button"
						variant="outline"
						className="h-11 w-full sm:h-9"
						disabled={disabled || limitReached}
						title={limitReached ? `${videoIds.length}/${MAX_VIDEOS}` : "Dodaj wideo"}
					>
						<Film className="h-4 w-4" />
						<span className="ml-2">
							{videoIds.length > 0 ? `Wideo (${videoIds.length}/${MAX_VIDEOS})` : "Dodaj wideo"}
						</span>
					</Button>
				</DialogTrigger>
				<DialogContent className="max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Wybierz wideo</DialogTitle>
						<DialogDescription>Kolejność klikania = kolejność w poście.</DialogDescription>
					</DialogHeader>
					{pickable.length === 0 ? (
						<p className="text-sm text-muted-foreground">Brak dostępnych wideo.</p>
					) : (
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
							{pickable.map((video) => (
								<button
									key={video.id}
									type="button"
									onClick={() => add(video.id)}
									className="overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:bg-accent"
								>
									<div className="aspect-video w-full overflow-hidden bg-muted">
										<img
											src={video.thumbnailUrl}
											alt={video.title}
											className="h-full w-full object-cover"
											loading="lazy"
										/>
									</div>
									<p className="line-clamp-2 p-2 text-xs font-medium text-foreground">
										{video.title}
									</p>
								</button>
							))}
						</div>
					)}
				</DialogContent>
			</Dialog>

			{selectedVideos.length > 0 && (
				<ul className="col-span-full space-y-2">
					{selectedVideos.map((video, index) => (
						<li
							key={video.id}
							className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
						>
							<img
								src={video.thumbnailUrl}
								alt={video.title}
								className="h-10 w-16 shrink-0 rounded object-cover"
							/>
							<span className="line-clamp-1 flex-1 text-sm text-foreground">{video.title}</span>
							<div className="flex items-center gap-1">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 w-7 p-0"
									onClick={() => move(index, -1)}
									disabled={index === 0}
									title="W górę"
								>
									<ArrowUp className="h-3 w-3" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 w-7 p-0"
									onClick={() => move(index, 1)}
									disabled={index === selectedVideos.length - 1}
									title="W dół"
								>
									<ArrowDown className="h-3 w-3" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 w-7 p-0 text-destructive"
									onClick={() => remove(video.id)}
									title="Usuń"
								>
									<X className="h-3 w-3" />
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}
		</>
	);
}
