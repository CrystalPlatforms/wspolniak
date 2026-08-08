// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import { useState } from "react";

interface BookmarkButtonProps {
	postId: string;
}

/** Współdzielony klucz zapytania o zbiór zapisanych postów (deduplikowany przez cache). */
export const SAVED_POSTS_KEY = ["bookmarks", "saved"] as const;

/** Kolor ikony zakładki (kontur + wypełnienie) gdy post jest zapisany — żółty. */
const BOOKMARK_SAVED_COLOR = "#fcc740";

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
	const [popping, setPopping] = useState(false);

	const mutation = useMutation({
		mutationFn: (next: boolean) => setBookmarkState(postId, next),
		onMutate: async (next: boolean) => {
			// Optymistyczna aktualizacja: natychmiast dodaj/usuń ID z cache, by ikona
			// zareagowała bez czekania na API (#126).
			await queryClient.cancelQueries({ queryKey: SAVED_POSTS_KEY });
			const previous = queryClient.getQueryData<Set<string>>(SAVED_POSTS_KEY);
			queryClient.setQueryData<Set<string>>(SAVED_POSTS_KEY, (old) => {
				const nextSet = new Set(old ?? []);
				if (next) nextSet.add(postId);
				else nextSet.delete(postId);
				return nextSet;
			});
			return { previous };
		},
		onError: (_error, _next, context) => {
			// Rollback do stanu sprzed kliknięcia, gdy API zawiedzie (#126).
			if (context?.previous !== undefined) {
				queryClient.setQueryData(SAVED_POSTS_KEY, context.previous);
			}
		},
		onSettled: () => {
			// Prefix ["bookmarks"] unieważnia i stan ikony (saved), i listę Biblioteki (list),
			// by odpinany post znikał z listy po przełączeniu (#127).
			queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
		},
	});

	function handleClick() {
		// Subtelna animacja „pop" przy przełączeniu stanu (#125).
		setPopping(true);
		window.setTimeout(() => setPopping(false), 320);
		mutation.mutate(!saved);
	}

	return (
		<button
			type="button"
			onClick={handleClick}
			aria-pressed={saved}
			aria-label={saved ? "Usuń z Biblioteki" : "Zapisz do Biblioteki"}
			style={saved ? { color: BOOKMARK_SAVED_COLOR } : undefined}
			className="inline-flex items-center gap-1 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
		>
			<Bookmark
				className="h-5 w-5 transition-colors duration-200"
				fill={saved ? "currentColor" : "none"}
				style={popping ? { animation: "bookmark-pop 300ms ease-in-out" } : undefined}
			/>
		</button>
	);
}
