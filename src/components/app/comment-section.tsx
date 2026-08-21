// SPDX-License-Identifier: AGPL-3.0-or-later
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircleIcon } from "lucide-react";
import { useState } from "react";
import { CommentItem } from "@/components/app/comment-item";
import { type Mention, MentionInput } from "@/components/app/mention-input";
import { optimisticCommentMutation } from "@/components/app/optimistic-comments";
import { SkeletonLine } from "@/components/app/post-card-skeleton";
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
	/**
	 * Choreografia #147: czy etap `comments` jest odsłonięty. `false` →
	 * szkielety linii (lista i formularz czekają; fetch leci w tle).
	 * Default `true` — użycie poza choreografią pokazuje sekcję od razu.
	 */
	reveal?: boolean;
}

/**
 * Opcje zapytania o komentarze — współdzielone przez CommentSection i stronę
 * posta (#147): ten sam klucz = jeden fetch, a strona odczytuje `isPending`
 * jako gotowość etapu `comments` bez callbacków.
 */
export const commentsQueryOptions = (postId: string) =>
	queryOptions({
		queryKey: ["comments", postId] as const,
		queryFn: () => fetchComments(postId),
	});

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

export function CommentSection({
	postId,
	currentUserId,
	currentUserRole,
	reveal = true,
}: CommentSectionProps) {
	const queryClient = useQueryClient();
	const [newComment, setNewComment] = useState("");
	const [mentions, setMentions] = useState<Mention[]>([]);

	const { data: comments = [] } = useQuery(commentsQueryOptions(postId));

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

	if (!reveal) {
		return (
			<section className="space-y-4" aria-busy="true">
				<div className="space-y-4" data-testid="skeleton-comments" aria-hidden="true">
					<SkeletonLine className="h-6 w-36" />
					{Array.from({ length: 3 }, (_, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: statyczna lista dekoracyjna o stałej długości
						<div key={index} className="space-y-2">
							<SkeletonLine className="w-24" />
							<SkeletonLine className="w-full" />
							<SkeletonLine className="w-2/3" />
						</div>
					))}
				</div>
			</section>
		);
	}

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
