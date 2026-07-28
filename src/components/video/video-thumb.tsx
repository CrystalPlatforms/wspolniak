// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";

interface VideoThumbProps {
	/** Id rekordu wideo (DB) — cel trasy `/app/video/$id`. */
	id: string;
	title: string;
	thumbnailUrl: string;
}

/**
 * Miniaturka wideo z czarnym zaokrąglonym kwadratem i zieloną (primary) ikoną play.
 * Klik nawiguje do detalu wideo `/app/video/$id`. Reużywana w feedzie i w poście.
 */
export function VideoThumb({ id, title, thumbnailUrl }: VideoThumbProps) {
	return (
		<Link
			to="/app/video/$id"
			params={{ id }}
			className="group relative block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-accent"
		>
			<div className="relative aspect-video w-full overflow-hidden bg-muted">
				<img
					src={thumbnailUrl}
					alt={title}
					className="h-full w-full object-cover transition-transform group-hover:scale-105"
					loading="lazy"
				/>
				<span className="absolute inset-0 flex items-center justify-center">
					<span className="flex size-12 items-center justify-center rounded-lg bg-black">
						<Play className="size-5 fill-primary text-primary" />
					</span>
				</span>
			</div>
			<p className="line-clamp-1 p-2 text-sm font-medium text-foreground">{title}</p>
		</Link>
	);
}
