// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MoreHorizontalIcon, PencilIcon, PinIcon, TrashIcon } from "lucide-react";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader } from "@/components/ui/loader";

interface PostActionsProps {
	postId: string;
	description: string | null;
	onDeleted?: () => void;
	isAdmin?: boolean;
	pinned?: boolean;
}

async function deletePost(postId: string) {
	const res = await fetch(`/api/app/posts/${postId}`, { method: "DELETE" });
	if (res.status === 403) throw new Error("Brak uprawnień do usunięcia tego posta");
	if (!res.ok) throw new Error("Nie udało się usunąć posta");
	return res.json();
}

export function PostActions({
	postId,
	description: _description,
	onDeleted,
	isAdmin,
	pinned,
}: PostActionsProps) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const deleteButtonRef = useRef<HTMLButtonElement>(null);

	const deleteMutation = useMutation({
		mutationFn: () => deletePost(postId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["posts"] });
			queryClient.invalidateQueries({ queryKey: ["posts", postId] });
			setDeleteOpen(false);
			onDeleted?.();
		},
	});

	const pinMutation = useMutation({
		mutationFn: async () => {
			const method = pinned ? "DELETE" : "POST";
			const res = await fetch(`/api/app/posts/${postId}/pin`, { method });
			if (res.status === 403) throw new Error("Brak uprawnień do przypinania postów");
			if (res.status === 422) throw new Error("Osiągnięto limit przypiętych postów (3)");
			if (!res.ok) throw new Error("Nie udało się przypiąć posta");
			return res.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["posts"] });
			queryClient.invalidateQueries({ queryKey: ["posts", postId] });
		},
	});

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="size-12 sm:size-16">
						<MoreHorizontalIcon className="size-6 sm:size-8" />
						<span className="sr-only">Opcje posta</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" side="top" className="min-w-48">
					<DropdownMenuItem
						onSelect={() => navigate({ to: "/app/post/$id/edit", params: { id: postId } })}
						className="py-3 sm:py-1.5 text-base sm:text-sm"
					>
						<PencilIcon />
						Edytuj
					</DropdownMenuItem>
					{isAdmin && (
						<DropdownMenuItem
							onSelect={() => pinMutation.mutate()}
							className="py-3 sm:py-1.5 text-base sm:text-sm"
						>
							<PinIcon />
							{pinned ? "Odepnij post" : "Przypnij post"}
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => {
							deleteMutation.reset();
							setDeleteOpen(true);
						}}
						className="py-3 sm:py-1.5 text-base sm:text-sm"
					>
						<TrashIcon />
						Usuń post
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent
					className="max-h-[90vh] overflow-y-auto"
					onOpenAutoFocus={(e) => {
						e.preventDefault();
						deleteButtonRef.current?.focus();
					}}
				>
					<DialogHeader>
						<DialogTitle>Usuń post</DialogTitle>
						<DialogDescription>
							Czy na pewno chcesz usunąć ten post? Tej operacji nie można cofnąć.
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
							<Loader loading={deleteMutation.isPending} />
							{deleteMutation.isPending ? "Usuwanie..." : "Usuń"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
