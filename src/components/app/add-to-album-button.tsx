// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { AlbumCreateDialog } from "@/components/app/album-create-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Loader } from "@/components/ui/loader";

interface AddableAlbumDto {
	id: string;
	title: string;
}

interface AddableAlbumsResponse {
	data: AddableAlbumDto[];
}

async function fetchAddableAlbums(): Promise<AddableAlbumsResponse> {
	const res = await fetch("/api/app/albums?addable=1");
	if (!res.ok) throw new Error("Nie udało się pobrać albumów");
	return (await res.json()) as AddableAlbumsResponse;
}

interface AddToAlbumButtonProps {
	/** Rodzaj elementu: pożyczone zdjęcie z posta albo wideo (#172). */
	kind: "post_photo" | "video";
	/** cfImageId (zdjęcie z posta) albo id wiersza wideo (#172). */
	itemRef: string;
	ariaLabel: string;
	className?: string;
	/** Zawartość triggera — styl i etykieta należą do mount-pointu. */
	children: ReactNode;
}

export function AddToAlbumButton({
	kind,
	itemRef,
	ariaLabel,
	className,
	children,
}: AddToAlbumButtonProps) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				aria-label={ariaLabel}
				className={className}
				onClick={(e) => {
					// Overlay lightboxa zamyka się od kliknięcia w tło — trigger nie może go odpalić.
					e.stopPropagation();
					setOpen(true);
				}}
			>
				{children}
			</button>
			<AddToAlbumDialog open={open} onOpenChange={setOpen} kind={kind} itemRef={itemRef} />
		</>
	);
}

interface AddToAlbumDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	kind: "post_photo" | "video";
	itemRef: string;
}

/**
 * Dialog „Dodaj do albumu" — deep module: cała logika wyboru albumu, dodawania
 * i empty state'u z skrótem do tworzenia albumu schowana za jednym komponentem.
 */
function AddToAlbumDialog({ open, onOpenChange, kind, itemRef }: AddToAlbumDialogProps) {
	const queryClient = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);

	const { data, isPending, isError } = useQuery({
		queryKey: ["albums", "addable"],
		queryFn: fetchAddableAlbums,
		enabled: open,
	});

	const addToAlbum = useMutation({
		mutationFn: async (album: AddableAlbumDto) => {
			const res = await fetch(`/api/app/albums/${album.id}/items`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ kind, refs: [itemRef] }),
			});
			if (!res.ok) throw new Error("Nie udało się dodać do albumu");
			return album;
		},
		onSuccess: () => {
			// Bez toastu potwierdzającego (revizja usera #173): dialog się zamyka,
			// element od razu widać w albumie — sukces jest oczywisty.
			// Prefix ["albums"] łapie listę, detail i „addable" — wszystkie widoki.
			queryClient.invalidateQueries({ queryKey: ["albums"] });
			onOpenChange(false);
		},
		onError: () => toast.error("Nie udało się dodać do albumu"),
	});

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Dodaj do albumu</DialogTitle>
						<DialogDescription>Wybierz album, do którego dołączyć element.</DialogDescription>
					</DialogHeader>

					{isPending ? (
						<div className="flex items-center justify-center py-6" aria-busy="true">
							<Loader />
						</div>
					) : isError ? (
						<p role="alert" className="text-sm text-destructive">
							Nie udało się pobrać albumów.
						</p>
					) : (data?.data ?? []).length === 0 ? (
						<div className="flex flex-col items-start gap-3 py-2">
							<p className="text-sm text-muted-foreground">
								Nie masz albumów, musisz najpierw stworzyć.
							</p>
							<Button onClick={() => setCreateOpen(true)}>Stwórz album</Button>
						</div>
					) : (
						<div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
							{(data?.data ?? []).map((album) => (
								<Button
									key={album.id}
									variant="ghost"
									className="w-full justify-start"
									disabled={addToAlbum.isPending}
									onClick={() => addToAlbum.mutate(album)}
								>
									{album.title}
								</Button>
							))}
						</div>
					)}
				</DialogContent>
			</Dialog>

			<AlbumCreateDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreated={() => queryClient.invalidateQueries({ queryKey: ["albums"] })}
			/>
		</>
	);
}
