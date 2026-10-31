// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconDotsVertical, IconDownload, IconPencil } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AlbumActionsMenuProps {
	/** Reviza #187: otwiera ekran „Edytuj album"; brak = pozycja ukryta. */
	onEdit?: () => void;
	/** GET zdjęć do pobrania (ZIP) — null = pozycja ukryta (pusty album). */
	zipUrl?: string | null;
	/** GET wideo do pobrania (HTML z linkami YT) — null = pozycja ukryta. */
	videosUrl?: string | null;
	/** Klasy pozycjonujące trigger (nagłówek widoku albumu). */
	triggerClassName?: string;
	/** Klasa ikony ⋯ — nagłówek albumu powiększa do size-6 (revizja usera). */
	iconClassName?: string;
	/** Wyrównanie menu — domyślnie "end". */
	align?: "start" | "end";
}

/**
 * Menu „⋯" albumu po revizji #187 — „Edytuj album" (zarządzanie: zmiana
 * nazwy, usunięcie — ekran /app/albums/$id/edit) oraz akcje treści:
 * „Pobierz zawartość" (ZIP) i „Pobierz wideo". Trigger zależny od kontekstu:
 * nagłówek widoku albumu.
 */
export function AlbumActionsMenu({
	onEdit,
	zipUrl,
	videosUrl,
	triggerClassName,
	iconClassName,
	align = "end",
}: AlbumActionsMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className={triggerClassName ?? "size-8"}
					aria-label="Opcje albumu"
				>
					<IconDotsVertical className={iconClassName ?? "size-4"} aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className="min-w-44">
				{onEdit && (
					<DropdownMenuItem onSelect={onEdit}>
						<IconPencil aria-hidden="true" />
						Edytuj album
					</DropdownMenuItem>
				)}
				{onEdit && (zipUrl || videosUrl) && <DropdownMenuSeparator />}
				{zipUrl && (
					<DropdownMenuItem asChild>
						<a href={zipUrl} download>
							<IconDownload aria-hidden="true" />
							Pobierz zawartość
						</a>
					</DropdownMenuItem>
				)}
				{videosUrl && (
					<DropdownMenuItem asChild>
						<a href={videosUrl} download>
							<IconDownload aria-hidden="true" />
							Pobierz wideo
						</a>
					</DropdownMenuItem>
				)}
				{!onEdit && !zipUrl && !videosUrl && (
					<div className="px-2 py-1.5 text-sm text-muted-foreground">Brak akcji</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
