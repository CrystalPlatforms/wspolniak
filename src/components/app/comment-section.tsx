// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircleIcon } from "lucide-react";
import { useState } from "react";
import { CommentItem } from "@/components/app/comment-item";
import { type Mention, MentionInput } from "@/components/app/mention-input";
import { optimisticCommentMutation } from "@/components/app/optimistic-comments";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";

export interface CommentWithAuthor {
	id: string;
	postId: string;
	authorId: string;
	body: string;
	parentId: string | null;
	createdAt: string;
	updatedAt: string;
	author: { id: string; name: string };
	replies: CommentWithAuthor[];
}

interface CommentSectionProps {
	postId: string;
	currentUserId: string;
	currentUserRole: string;
}

async function fetchComments(postId: string): Promise<CommentWithAuthor[]> {
	const res = await fetch(`/api/app/posts/${postId}/comments`);
	if (!res.ok) throw new Error("Nie udało się pobrać komentarzy");
	const json = (await res.json()) as { data: CommentWithAuthor[] };
	return json.data;
}

async function addComment(postId: string, body: string, mentions: Mention[]) {
	const res = await fetch(`/api/app/posts/${postId}/comments`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ body, mentions }),
	});
	if (!res.ok) {
		const json = (await res.json()) as { error: string };
		throw new Error(json.error || "Nie udało się dodać komentarza");
	}
	return res.json();
}

export function CommentSection({ postId, currentUserId, currentUserRole }: CommentSectionProps) {
	const queryClient = useQueryClient();
	const [newComment, setNewComment] = useState("");
	const [mentions, setMentions] = useState<Mention[]>([]);

	const { data: comments = [] } = useQuery({
		queryKey: ["comments", postId],
		queryFn: () => fetchComments(postId),
	});

	const optimistic = optimisticCommentMutation(queryClient, postId, {
		id: currentUserId,
		name: "",
	});

	const mutation = useMutation({
		mutationFn: ({ body, mentions: ms }: { body: string; mentions: Mention[] }) =>
			addComment(postId, body, ms),
		onMutate: async ({ body }) => optimistic.onMutate(body),
		onError: (error, _vars, context) => optimistic.onError(error, "", context),
		onSuccess: async () => {
			setNewComment("");
			setMentions([]);
			await optimistic.onSuccess();
		},
	});

	return (
		<section className="space-y-4">
			<h2 className="flex items-center gap-2 font-semibold text-foreground">
				<MessageCircleIcon className="size-5" />
				Komentarze ({comments.length})
			</h2>

			<div className="space-y-3">
				{comments.map((comment) => (
					<CommentItem
						key={comment.id}
						comment={comment}
						postId={postId}
						currentUserId={currentUserId}
						currentUserRole={currentUserRole}
					/>
				))}
			</div>

			<div id="new-comment" className="space-y-2">
				{mutation.isError && (
					<Alert variant="destructive">
						<AlertDescription>{mutation.error.message}</AlertDescription>
					</Alert>
				)}
				<MentionInput
					value={newComment}
					onChange={setNewComment}
					onMentionsChange={setMentions}
					currentUserId={currentUserId}
					placeholder="Napisz komentarz... (@aby kogoś oznaczyć)"
					maxLength={1000}
					rows={2}
				/>
				<div className="flex items-center justify-between">
					<span className="text-xs text-muted-foreground">{newComment.length}/1000</span>
					<Button
						className="h-11 sm:h-8"
						onClick={() => {
							mutation.reset();
							// Tylko wspomnienia, których `@imię` nadal figuruje w tekście.
							const validMentions = mentions.filter((m) => newComment.includes(`@${m.name}`));
							mutation.mutate({ body: newComment, mentions: validMentions });
						}}
						disabled={mutation.isPending || !newComment.trim()}
					>
						<Loader loading={mutation.isPending} />
						{mutation.isPending ? "Wysyłanie..." : "Skomentuj"}
					</Button>
				</div>
			</div>
		</section>
	);
}
