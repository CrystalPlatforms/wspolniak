// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Images, MoreVerticalIcon, PencilIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";

/** Klucz invalidacji listy kafelków — współdzielony (albums-list trzyma swój). */
const ALBUMS_LIST_KEY = ["albums", "list"] as const;

interface AlbumActionsMenuProps {
	albumId: string;
	/** Aktualny tytuł — wartość startowa pola w dialogu zmiany nazwy. */
	albumTitle: string;
	/** Klasy pozycjonujące trigger: kafelek listy vs nagłówek widoku. */
	triggerClassName?: string;
	/** Klasa ikony ⋯ — nagłówek albumu powiększa do size-6 (revizja usera). */
	iconClassName?: string;
	/** Wyrównanie menu — kafelek: "start", nagłówek: "end" (domyślne). */
	align?: "start" | "end";
	/**
	 * Pozycje zarządzania (zmiana nazwy, usunięcie) — tylko twórca/admin (#173).
	 * Default true zachowuje zachowanie kafelka listy (ten i tak renderuje menu
	 * wyłącznie dla zarządzających).
	 */
	canManage?: boolean;
	/** Akcje treści w menu (revizja usera #175): przyciski nagłówka się nie mieściły. */
	onAddPhotos?: () => void;
	zipUrl?: string | null;
	videosUrl?: string | null;
	/** Parent odświeża widoki po zmianie nazwy / usunięciu albumu. */
	onRenamed?: (title: string) => void;
	onDeleted?: () => void;
}

async function patchAlbum(albumId: string, body: { title?: string }) {
	const res = await fetch(`/api/app/albums/${albumId}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (res.status === 403) throw new Error("Brak uprawnień do zarządzania tym albumem");
	if (!res.ok) {
		const json = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new Error(json?.error ?? "Nie udało się zapisać zmian");
	}
	return res.json();
}

async function deleteAlbumApi(albumId: string) {
	const res = await fetch(`/api/app/albums/${albumId}`, { method: "DELETE" });
	if (res.status === 403) throw new Error("Brak uprawnień do usunięcia tego albumu");
	if (!res.ok) {
		const json = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new Error(json?.error ?? "Nie udało się usunąć albumu");
	}
	return res.json();
}

/**
 * Menu „⋯" albumu (#173): zmiana nazwy + usunięcie albumu. Od revizji usera
 * (#175) w nagłówku widoku albumu menu jest dla WSZYSTKICH i zawiera też akcje
 * treści: „Dodaj zdjęcia", „Pobierz zdjęcia (ZIP)", „Pobierz wideo" — przyciski
 * nagłówka się nie mieściły; pozycje zarządzania zostają pod canManage. Jeden
 * komponent dla kafelka listy (trigger na okładce) i nagłówka widoku. Dialogi
 * (nazwa, potwierdzenie usunięcia) w środku — parent dostaje tylko callbacki
 * onRenamed/onDeleted.
 */
export function AlbumActionsMenu({
	albumId,
	albumTitle,
	triggerClassName,
	iconClassName,
	align = "end",
	canManage = true,
	onAddPhotos,
	zipUrl,
	videosUrl,
	onRenamed,
	onDeleted,
}: AlbumActionsMenuProps) {
	const queryClient = useQueryClient();
	const [renameOpen, setRenameOpen] = useState(false);
	const [_deleteOpen, setDeleteOpen] = useState(false);
	const [renameTitle, setRenameTitle] = useState(albumTitle);

	const renameMutation = useMutation({
		mutationFn: (title: string) => patchAlbum(albumId, { title }),
		onSuccess: (_data, title) => {
			queryClient.invalidateQueries({ queryKey: ALBUMS_LIST_KEY });
			queryClient.invalidateQueries({ queryKey: ["albums", "detail", albumId] });
			setRenameOpen(false);
			onRenamed?.(title);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: () => deleteAlbumApi(albumId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ALBUMS_LIST_KEY });
			setDeleteOpen(false);
			onDeleted?.();
		},
	});

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className={triggerClassName ?? "size-8"}
						aria-label="Opcje albumu"
					>
						<MoreVerticalIcon className={iconClassName ?? "size-4"} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align={align} className="min-w-44">
					{onAddPhotos && (
						<DropdownMenuItem onSelect={onAddPhotos}>
							<Images />
							Dodaj zdjęcia
						</DropdownMenuItem>
					)}
					{zipUrl && (
						<DropdownMenuItem asChild>
							<a href={zipUrl} download>
								<Download />
								Pobierz zdjęcia (ZIP)
							</a>
						</DropdownMenuItem>
					)}
					{videosUrl && (
						<DropdownMenuItem asChild>
							<a href={videosUrl} download>
								<Download />
								Pobierz wideo
							</a>
						</DropdownMenuItem>
					)}
					{canManage && (onAddPhotos || zipUrl || videosUrl) && <DropdownMenuSeparator />}
					{canManage && (
						<>
							<DropdownMenuItem
								onSelect={() => {
									setRenameTitle(albumTitle);
									renameMutation.reset();
									setRenameOpen(true);
								}}
							>
								<PencilIcon />
								Zmień nazwę
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => {
									deleteMutation.reset();
									setDeleteOpen(true);
								}}
							>
								<TrashIcon />
								Usuń album
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={renameOpen} onOpenChange={setRenameOpen}>
				<DialogContent aria-describedby={undefined} className="sm:max-w-md">
					<form
						onSubmit={(event) => {
							event.preventDefault();
							if (!renameTitle.trim()) return;
							renameMutation.mutate(renameTitle.trim());
						}}
						className="space-y-4"
					>
						<DialogHeader>
							<DialogTitle>Zmień nazwę albumu</DialogTitle>
						</DialogHeader>
						<div className="space-y-2">
							<Label htmlFor="album-rename-input">Tytuł</Label>
							<Input
								id="album-rename-input"
								value={renameTitle}
								onChange={(e) => setRenameTitle(e.target.value)}
								maxLength={100}
							/>
						</div>
						{renameMutation.isError && (
							<p role="alert" className="text-sm text-destructive">
								{renameMutation.error.message}
							</p>
						)}
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setRenameOpen(false)}
								disabled={renameMutation.isPending}
							>
								Anuluj
							</Button>
							<Button type="submit" disabled={renameMutation.isPending || !renameTitle.trim()}>
								<Loader loading={renameMutation.isPending} />
								{renameMutation.isPending ? "Zapisywanie..." : "Zapisz"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={_deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent className="max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Usuń album</DialogTitle>
						<DialogDescription>
							Czy na pewno chcesz usunąć album „{albumTitle}"? Zdjęcia dodane bezpośrednio do albumu
							zostaną usunięte z Cloudflare, a pożyczone z postów i wideo zostaną na miejscu. Tej
							operacji nie można cofnąć.
						</DialogDescription>
					</DialogHeader>
					{deleteMutation.isError && (
						<Alert variant="destructive">
							<AlertDescription>{deleteMutation.error.message}</AlertDescription>
						</Alert>
					)}
					<DialogFooter className="gap-2 sm:gap-0">
						<Button
							variant="outline"
							onClick={() => setDeleteOpen(false)}
							disabled={deleteMutation.isPending}
							className="h-12 text-base sm:h-auto sm:text-sm flex-1 sm:flex-none"
						>
							Anuluj
						</Button>
						<Button
							variant="destructive"
							onClick={() => deleteMutation.mutate()}
							disabled={deleteMutation.isPending}
							className="h-12 text-base sm:h-auto sm:text-sm flex-1 sm:flex-none"
						>
							<Loader loading={deleteMutation.isPending} />
							{deleteMutation.isPending ? "Usuwanie..." : "Usuń"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
