// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";

interface BookmarkButtonProps {
	postId: string;
}

/** Współdzielony klucz zapytania o zbiór zapisanych postów (deduplikowany przez cache). */
export const SAVED_POSTS_KEY = ["bookmarks", "saved"] as const;

/** Pobiera listę zapisanych postów i redukuje ją do zbioru ID. */
async function fetchSavedPostIds(): Promise<Set<string>> {
	const res = await fetch("/api/app/bookmarks");
	if (!res.ok) throw new Error("Nie udało się pobrać zapisanych postów");
	const json = (await res.json()) as { data: { id: string }[] };
	return new Set(json.data.map((post) => post.id));
}

/** Zapisuje lub usuwa posta z Biblioteki w zależności od docelowego stanu. */
async function setBookmarkState(postId: string, saved: boolean): Promise<void> {
	const res = saved
		? await fetch("/api/app/bookmarks", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ postId }),
			})
		: await fetch(`/api/app/bookmarks/${postId}`, { method: "DELETE" });
	if (!res.ok) throw new Error("Nie udało się zapisać posta do Biblioteki");
}

/**
 * Przycisk zapisu posta do Biblioteki. Stan zapisu pochodzi ze współdzielonego
 * zapytania (GET /api/app/bookmarks); klik przełącza POST/DELETE i odświeża cache.
 */
export function BookmarkButton({ postId }: BookmarkButtonProps) {
	const queryClient = useQueryClient();
	const { data: savedIds } = useQuery({
		queryKey: SAVED_POSTS_KEY,
		queryFn: fetchSavedPostIds,
	});
	const saved = savedIds?.has(postId) ?? false;

	const mutation = useMutation({
		mutationFn: (next: boolean) => setBookmarkState(postId, next),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: SAVED_POSTS_KEY });
		},
	});

	return (
		<button
			type="button"
			onClick={() => mutation.mutate(!saved)}
			aria-pressed={saved}
			aria-label={saved ? "Usuń z Biblioteki" : "Zapisz do Biblioteki"}
			className="flex items-center gap-1.5 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:px-2 sm:py-1"
		>
			<Bookmark className="size-6 sm:size-4" fill={saved ? "currentColor" : "none"} />
		</button>
	);
}
