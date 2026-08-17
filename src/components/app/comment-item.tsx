// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ReplyIcon } from "lucide-react";
import { useState } from "react";
import { CommentActions } from "@/components/app/comment-actions";
import type { CommentWithAuthor } from "@/components/app/comment-section";
import { type Mention, MentionInput } from "@/components/app/mention-input";
import { MentionText } from "@/components/app/mention-text";
import { ReactionBar } from "@/components/app/reaction-bar";
import { ReactionUsers } from "@/components/app/reaction-users";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { canAddReply } from "@/db/comments/queries";

interface CommentItemProps {
	comment: CommentWithAuthor;
	postId: string;
	currentUserId: string;
	currentUserRole: string;
}

async function addReply(postId: string, commentId: string, body: string, mentions: Mention[]) {
	const res = await fetch(`/api/app/posts/${postId}/comments/${commentId}/replies`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ body, mentions }),
	});
	if (!res.ok) {
		const json = (await res.json().catch(() => ({ error: "" }))) as { error?: string };
		throw new Error(json.error || "Nie udało się dodać odpowiedzi");
	}
	return res.json();
}

function formatCommentDate(iso: string): string {
	return new Date(iso).toLocaleDateString("pl-PL", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function CommentItem({ comment, postId, currentUserId, currentUserRole }: CommentItemProps) {
	const queryClient = useQueryClient();
	const [showReplyForm, setShowReplyForm] = useState(false);
	const [replyBody, setReplyBody] = useState("");
	const [replyMentions, setReplyMentions] = useState<Mention[]>([]);

	const isTopLevel = comment.parentId === null;
	const canManage = currentUserId === comment.authorId || currentUserRole === "admin";
	const replyAllowed = isTopLevel && canAddReply(comment.replies.length);

	const replyMutation = useMutation({
		mutationFn: ({ body, mentions }: { body: string; mentions: Mention[] }) =>
			addReply(postId, comment.id, body, mentions),
		onSuccess: async () => {
			setReplyBody("");
			setReplyMentions([]);
			setShowReplyForm(false);
			await queryClient.invalidateQueries({ queryKey: ["comments", postId] });
		},
	});

	return (
		<div
			className={
				isTopLevel
					? "rounded-md border border-border bg-muted/50 p-3"
					: "rounded-md bg-background/40 p-2"
			}
		>
			<div className="mb-1 flex items-center gap-2">
				<span className="text-sm font-medium text-foreground">{comment.author.name}</span>
				<time className="text-xs text-muted-foreground" dateTime={comment.createdAt}>
					{formatCommentDate(comment.createdAt)}
				</time>
				{isTopLevel && comment.replies.length > 0 && (
					<span className="text-xs text-muted-foreground">
						{comment.replies.length} {comment.replies.length === 1 ? "odpowiedź" : "odpowiedzi"}
					</span>
				)}
				<div className="ml-auto flex items-center gap-1">
					{isTopLevel && replyAllowed && (
						<button
							type="button"
							aria-label="Odpowiedz"
							title="Odpowiedz"
							onClick={() => {
								replyMutation.reset();
								setShowReplyForm((v) => !v);
							}}
							className="inline-flex items-center gap-1 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
						>
							<ReplyIcon className="h-5 w-5" />
						</button>
					)}
					<ReactionUsers target={{ kind: "comment", postId, commentId: comment.id }} />
					{canManage && (
						<CommentActions postId={postId} commentId={comment.id} body={comment.body} />
					)}
				</div>
			</div>
			<MentionText
				text={comment.body}
				className="whitespace-pre-wrap break-words text-sm text-foreground"
			/>

			{currentUserId && (
				<div className="mt-2 flex items-center gap-2">
					<ReactionBar target={{ kind: "comment", postId, commentId: comment.id }} />
				</div>
			)}

			{showReplyForm && replyAllowed && (
				<div className="mt-2 space-y-2">
					{replyMutation.isError && (
						<Alert variant="destructive">
							<AlertDescription>{replyMutation.error.message}</AlertDescription>
						</Alert>
					)}
					<MentionInput
						value={replyBody}
						onChange={setReplyBody}
						onMentionsChange={setReplyMentions}
						currentUserId={currentUserId}
						placeholder="Napisz odpowiedź... (@aby kogoś oznaczyć)"
						maxLength={1000}
						rows={2}
					/>
					<div className="flex items-center justify-between">
						<span className="text-xs text-muted-foreground">{replyBody.length}/1000</span>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								className="h-8"
								onClick={() => {
									setShowReplyForm(false);
									setReplyBody("");
									setReplyMentions([]);
									replyMutation.reset();
								}}
							>
								Anuluj
							</Button>
							<Button
								size="sm"
								className="h-8"
								onClick={() => {
									replyMutation.reset();
									const validMentions = replyMentions.filter((m) =>
										replyBody.includes(`@${m.name}`),
									);
									replyMutation.mutate({ body: replyBody, mentions: validMentions });
								}}
								disabled={replyMutation.isPending || !replyBody.trim()}
							>
								<Loader loading={replyMutation.isPending} />
								{replyMutation.isPending ? "Wysyłanie..." : "Wyślij"}
							</Button>
						</div>
					</div>
				</div>
			)}

			{isTopLevel && comment.replies.length > 0 && (
				<div className="mt-3 space-y-2 border-l border-border pl-3">
					{comment.replies.map((reply) => (
						<CommentItem
							key={reply.id}
							comment={reply}
							postId={postId}
							currentUserId={currentUserId}
							currentUserRole={currentUserRole}
						/>
					))}
				</div>
			)}
		</div>
	);
}
