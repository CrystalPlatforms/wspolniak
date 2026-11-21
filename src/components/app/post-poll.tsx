// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconCheck } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { EnrichedPost } from "@/core/feed";
import type { PostPollData } from "@/db/posts/schema";

/** Klucz cache widoku pojedynczego posta (spójny z routes/app/post.$id.tsx). */
const POST_DETAIL_KEY = (postId: string) => ["posts", postId] as const;
/** Klucz cache Biblioteki (spójny z bookmarks-list.tsx). */
const BOOKMARKS_KEY = ["bookmarks", "list"] as const;

/**
 * Zapis liczników i własnego głosu w cache'ach feedu, widoku posta i Biblioteki.
 * Optymistyczny klik i potwierdzenie serwera przechodzą tę samą drogą, więc
 * paski reagują natychmiast i nie cofają się po odpowiedzi.
 */
function patchPostPoll(
	queryClient: ReturnType<typeof useQueryClient>,
	postId: string,
	patch: { counts: number[]; myVoteIndex: number | null },
): void {
	const patchPost = (post: EnrichedPost): EnrichedPost => {
		if (post.id !== postId || !post.poll) return post;
		return {
			...post,
			poll: { ...post.poll, counts: patch.counts, myVoteIndex: patch.myVoteIndex },
		};
	};

	queryClient.setQueryData<{ data: { poll: PostPollData | null } & Record<string, unknown> }>(
		POST_DETAIL_KEY(postId),
		(old) => {
			if (!old) return old;
			return { ...old, data: patchPost(old.data as EnrichedPost) };
		},
	);
	queryClient.setQueryData<{ data: EnrichedPost[] }>(BOOKMARKS_KEY, (old) => {
		if (!old) return old;
		return { ...old, data: old.data.map(patchPost) };
	});
	// Feed to infinite query: strony lecą po kolei w data.pages. Prefiks ["posts"]
	// łapie też klucz widoku posta ["posts", id] — updater musi umieć odrzucić
	// kształt bez `pages` (sama podmiana klucza detail powyżej go załatwia).
	queryClient.setQueriesData<{ pages: { data: EnrichedPost[] }[] }>(
		{ queryKey: ["posts"], exact: false },
		(old) => {
			if (!old || !Array.isArray(old.pages)) return old;
			return {
				...old,
				pages: old.pages.map((page) => ({
					...page,
					data: Array.isArray(page.data) ? page.data.map(patchPost) : page.data,
				})),
			};
		},
	);
}

async function votePostPollRequest(postId: string, optionIndex: number) {
	const res = await fetch(`/api/app/posts/${postId}/poll/vote`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ optionIndex }),
	});
	if (!res.ok) throw new Error("Nie udało się zagłosować");
	const json = (await res.json()) as { data: { counts: number[]; myVoteIndex: number } };
	return json.data;
}

/** "1 głos / 2-4 głosy / 5+ głosów" — polska odmiana dla podsumowania ankiety. */
function pollVotesLabel(total: number): string {
	if (total === 1) return "1 głos";
	const mod10 = total % 10;
	const mod100 = total % 100;
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${total} głosy`;
	return `${total} głosów`;
}

export interface PostPollProps {
	postId: string;
	poll: PostPollData;
}

/**
 * Ankieta w karcie posta i widoku posta (#241): opcje jako klikalne wiersze
 * z paskiem wyniku i liczbą głosów. Wyniki widać zawsze, także przed
 * oddaniem głosu; klik w inną opcję zmienia głos (atomowy upsert na serwerze),
 * klik w własną nic nie zmienia. Głosowanie tajne — UI pokazuje wyłącznie
 * liczniki, nigdy nazwisk.
 */
export function PostPoll({ postId, poll }: PostPollProps) {
	const queryClient = useQueryClient();

	const vote = useMutation({
		mutationFn: (optionIndex: number) => votePostPollRequest(postId, optionIndex),
		onMutate: (optionIndex) => {
			// Optymistycznie: licznik przeskakuje od razu, podświetlenie idzie za mój głos.
			const counts = poll.counts.map((count, i) => {
				if (i === optionIndex) return count + 1;
				if (poll.myVoteIndex === i) return Math.max(0, count - 1);
				return count;
			});
			patchPostPoll(queryClient, postId, { counts, myVoteIndex: optionIndex });
		},
		onSuccess: (data) => {
			patchPostPoll(queryClient, postId, data);
		},
		onError: () => {
			toast.error("Nie udało się zagłosować");
			void queryClient.invalidateQueries({ queryKey: ["posts"] });
			void queryClient.invalidateQueries({ queryKey: POST_DETAIL_KEY(postId) });
		},
	});

	const total = poll.counts.reduce((sum, count) => sum + count, 0);

	return (
		<div data-post-poll className="rounded-md border border-border bg-card p-3">
			<p className="mb-2 text-sm font-medium text-foreground">{poll.question}</p>
			<fieldset className="flex flex-col gap-1.5 border-0 p-0 m-0">
				<legend className="sr-only">Opcje ankiety</legend>
				{poll.options.map((option, index) => {
					const count = poll.counts[index] ?? 0;
					const pct = total > 0 ? Math.round((count / total) * 100) : 0;
					const mine = poll.myVoteIndex === index;
					return (
						<button
							key={option}
							type="button"
							onClick={() => {
								if (poll.myVoteIndex !== index) vote.mutate(index);
							}}
							disabled={vote.isPending}
							aria-pressed={mine}
							aria-label={`Głosuj na: ${option}`}
							className="relative flex w-full items-center gap-2 overflow-hidden rounded-full border border-input bg-background px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-60"
						>
							{/* Pasek wyniku — skala przez transform (bez animowania width). */}
							<span
								aria-hidden="true"
								className="absolute inset-y-0 left-0 w-full origin-left bg-primary/10 transition-transform duration-300"
								style={{ transform: `scaleX(${pct / 100})` }}
							/>
							{mine && (
								<IconCheck className="relative size-4 shrink-0 text-primary" aria-hidden="true" />
							)}
							<span className="relative min-w-0 flex-1 truncate">{option}</span>
							<span className="relative shrink-0 text-xs tabular-nums text-muted-foreground">
								{pct}%
							</span>
							<span className="relative shrink-0 text-xs tabular-nums text-muted-foreground">
								{count}
							</span>
						</button>
					);
				})}
			</fieldset>
			<p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
				{pollVotesLabel(total)}
			</p>
		</div>
	);
}

interface PostPollSummaryProps {
	poll: { question: string; options: string[] };
}

/**
 * Ankieta w trybie tylko do czytania — formularz edycji posta (#241). Po
 * publikacji ankiety nie można zmienić (głosy muszą zostać wiarygodne),
 * więc edycja pokazuje ją jako listę opcji bez inputów.
 */
export function PostPollSummary({ poll }: PostPollSummaryProps) {
	return (
		<div data-post-poll-readonly className="rounded-md border border-border bg-card p-3">
			<p className="mb-1 text-sm font-medium text-foreground">{poll.question}</p>
			<ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
				{poll.options.map((option) => (
					<li key={option}>{option}</li>
				))}
			</ul>
			<p className="mt-2 text-xs text-muted-foreground">
				Ankiety nie można edytować po publikacji posta.
			</p>
		</div>
	);
}
