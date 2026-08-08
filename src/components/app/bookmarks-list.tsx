// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import { PostCard, type PostCardPost } from "@/components/app/post-card";
import { Spinner } from "@/components/ui/spinner";

/** Współdzielony klucz zapytania o pełną listę zapisanych postów (strona Biblioteka). */
export const BOOKMARKED_POSTS_KEY = ["bookmarks", "list"] as const;

/** Odpowiedź GET /api/app/bookmarks — pełne posty + hash konta zdjęć. */
interface BookmarksResponse {
	data: PostCardPost[];
	meta: { imageAccountHash: string };
}

/** Pobiera zapisane posty zalogowanego użytkownika (najnowsze pierwsze) z hashem konta zdjęć. */
async function fetchBookmarkedPosts(): Promise<BookmarksResponse> {
	const res = await fetch("/api/app/bookmarks");
	if (!res.ok) throw new Error("Nie udało się pobrać zapisanych postów");
	return (await res.json()) as BookmarksResponse;
}

interface BookmarksListProps {
	currentUserId: string;
	currentUserRole: string;
}

/**
 * Lista zapisanych postów (Biblioteka). Renderuje te same PostCard co feed, dzięki czemu
 * Biblioteka wygląda identycznie (reakcje, komentarze, zakładka). Hash konta zdjęć pochodzi
 * z odpowiedzi API (meta), sesja z propsów — dla uprawnień PostActions w PostCard.
 */
export function BookmarksList({ currentUserId, currentUserRole }: BookmarksListProps) {
	const { data, isPending } = useQuery({
		queryKey: BOOKMARKED_POSTS_KEY,
		queryFn: fetchBookmarkedPosts,
	});

	if (isPending) {
		return (
			<output
				aria-label="Ładowanie zapisanych postów"
				className="flex items-center justify-center py-12"
			>
				<Spinner loading size={6} />
			</output>
		);
	}

	if (!data || data.data.length === 0) {
		return (
			<div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
				<Bookmark className="size-12" aria-hidden="true" />
				<p>Nie masz jeszcze zapisanych postów. Kliknij 🔖 przy poście, aby go zapisać.</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{data.data.map((post) => (
				<PostCard
					key={post.id}
					post={post}
					imageAccountHash={data.meta.imageAccountHash}
					currentUserId={currentUserId}
					currentUserRole={currentUserRole}
				/>
			))}
		</div>
	);
}
