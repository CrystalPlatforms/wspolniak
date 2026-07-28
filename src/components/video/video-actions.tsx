// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { TrashIcon } from "lucide-react";
import { useRef, useState } from "react";
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
import { LoaderIcon } from "@/components/ui/spinner";

interface VideoActionsProps {
	videoId: string;
}

async function deleteVideo(videoId: string) {
	const res = await fetch(`/api/video/${videoId}`, { method: "DELETE" });
	if (res.status === 403) throw new Error("Brak uprawnień do usunięcia tego wideo");
	if (!res.ok) throw new Error("Nie udało się usunąć wideo");
	return res.json();
}

/**
 * Akcja usuwania wideo (F4): przycisk-kosz otwierający dialog potwierdzenia.
 * Po sukcesie unieważnia cache feedu (`["videos"]`) i szczegółu (`["videos", id]`),
 * po czym wraca do `/app/video`. Autor/admin — gating odbywa się w `video.$id.tsx`
 * (komponent renderowany tylko gdy `session.userId === authorId || role === "admin"`).
 */
export function VideoActions({ videoId }: VideoActionsProps) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const deleteButtonRef = useRef<HTMLButtonElement>(null);

	const deleteMutation = useMutation({
		mutationFn: () => deleteVideo(videoId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["videos"] });
			queryClient.invalidateQueries({ queryKey: ["videos", videoId] });
			setDeleteOpen(false);
			navigate({ to: "/app/video" });
		},
	});

	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				className="size-12 sm:size-16"
				onClick={() => {
					deleteMutation.reset();
					setDeleteOpen(true);
				}}
			>
				<TrashIcon className="size-6 sm:size-8" />
				<span className="sr-only">Usuń wideo</span>
			</Button>

			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent
					className="max-h-[90vh] overflow-y-auto"
					onOpenAutoFocus={(e) => {
						e.preventDefault();
						deleteButtonRef.current?.focus();
					}}
				>
					<DialogHeader>
						<DialogTitle>Usuń wideo</DialogTitle>
						<DialogDescription>
							Czy na pewno chcesz usunąć to wideo? Tej operacji nie można cofnąć.
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
							className="h-12 text-base sm:h-auto sm:text-sm flex-1 sm:flex-none"
						>
							Anuluj
						</Button>
						<Button
							ref={deleteButtonRef}
							variant="destructive"
							onClick={() => deleteMutation.mutate()}
							disabled={deleteMutation.isPending}
							className="h-12 text-base sm:h-auto sm:text-sm flex-1 sm:flex-none"
						>
							<LoaderIcon loading={deleteMutation.isPending} />
							{deleteMutation.isPending ? "Usuwanie..." : "Usuń"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
