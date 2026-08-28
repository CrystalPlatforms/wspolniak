// SPDX-License-Identifier: AGPL-3.0-or-later
import { MoreVerticalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AlbumItemMenuProps {
	/** "own_image" | "post_photo" — zdjęcie (może być okładką); "video" — bez okładki. */
	kind: string;
	/** Prawda, gdy ten element JEST okładką (ukryj „Ustaw jako okładkę"). */
	isCurrentCover: boolean;
	onSetCover: () => void;
	/** Wywoływane po kliknięciu „Ustaw jako okładkę" / „Usuń z albumu". */
	onRemove: () => void;
}
/**
 * Menu „⋯" pojedynczego elementu albumu (#173): „Ustaw jako okładkę" (tylko
 * zdjęcia, nie dla bieżącej okładki) + „Usuń z albumu". Prezentacyjne —
 * mutacje i invalidacje siedzą w rodzicu (AlbumView), menu woła callbacki.
 */
export function AlbumItemMenu({ kind, isCurrentCover, onSetCover, onRemove }: AlbumItemMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 rounded-full bg-background/80 hover:bg-background"
					aria-label="Opcje elementu"
				>
					<MoreVerticalIcon className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-44">
				{kind !== "video" && !isCurrentCover && (
					<DropdownMenuItem onSelect={onSetCover}>Ustaw jako okładkę</DropdownMenuItem>
				)}
				<DropdownMenuItem variant="destructive" onSelect={onRemove}>
					Usuń z albumu
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
