// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontalIcon, PencilIcon, TrashIcon } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

interface CommentActionsProps {
	postId: string;
	commentId: string;
	body: string;
}

async function editComment(postId: string, commentId: string, body: string) {
	const res = await fetch(`/api/app/posts/${postId}/comments/${commentId}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ body }),
	});
	if (res.status === 403) throw new Error("Brak uprawnień do edycji tego komentarza");
	if (!res.ok) throw new Error("Nie udało się edytować komentarza");
	return res.json();
}

async function deleteComment(postId: string, commentId: string) {
	const res = await fetch(`/api/app/posts/${postId}/comments/${commentId}`, {
		method: "DELETE",
	});
	if (res.status === 403) throw new Error("Brak uprawnień do usunięcia tego komentarza");
	if (!res.ok) throw new Error("Nie udało się usunąć komentarza");
	return res.json();
}

export function CommentActions({ postId, commentId, body }: CommentActionsProps) {
	const queryClient = useQueryClient();
	const [editOpen, setEditOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [editValue, setEditValue] = useState(body);
	const deleteButtonRef = useRef<HTMLButtonElement>(null);

	const editMutation = useMutation({
		mutationFn: (newBody: string) => editComment(postId, commentId, newBody),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["comments", postId] });
			setEditOpen(false);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: () => deleteComment(postId, commentId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["comments", postId] });
			queryClient.invalidateQueries({ queryKey: ["posts"] });
			setDeleteOpen(false);
		},
	});

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="size-12 sm:size-16">
						<MoreHorizontalIcon className="size-6 sm:size-8" />
						<span className="sr-only">Opcje komentarza</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" side="top" className="min-w-48">
					<DropdownMenuItem
						onSelect={() => {
							setEditValue(body);
							editMutation.reset();
							setEditOpen(true);
						}}
						className="py-3 sm:py-1.5 text-base sm:text-sm"
					>
						<PencilIcon />
						Edytuj
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => {
							deleteMutation.reset();
							setDeleteOpen(true);
						}}
						className="py-3 sm:py-1.5 text-base sm:text-sm"
					>
						<TrashIcon />
						Usuń
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={editOpen} onOpenChange={setEditOpen}>
				<DialogContent className="max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Edytuj komentarz</DialogTitle>
					</DialogHeader>
					{editMutation.isError && (
						<Alert variant="destructive">
							<AlertDescription>{editMutation.error.message}</AlertDescription>
						</Alert>
					)}
					<Textarea
						value={editValue}
						onChange={(e) => setEditValue(e.target.value)}
						maxLength={1000}
						rows={3}
					/>
					<DialogFooter className="gap-2 sm:gap-0">
						<Button
							variant="outline"
							onClick={() => setEditOpen(false)}
							className="h-12 text-base sm:h-auto sm:text-sm flex-1 sm:flex-none"
						>
							Anuluj
						</Button>
						<Button
							onClick={() => editMutation.mutate(editValue)}
							disabled={editMutation.isPending || !editValue.trim()}
							className="h-12 text-base sm:h-auto sm:text-sm flex-1 sm:flex-none"
						>
							<Loader loading={editMutation.isPending} />
							{editMutation.isPending ? "Zapisywanie..." : "Zapisz"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent
					className="max-h-[90vh] overflow-y-auto"
					onOpenAutoFocus={(e) => {
						e.preventDefault();
						deleteButtonRef.current?.focus();
					}}
				>
					<DialogHeader>
						<DialogTitle>Usuń komentarz</DialogTitle>
						<DialogDescription>Czy na pewno chcesz usunąć ten komentarz?</DialogDescription>
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
