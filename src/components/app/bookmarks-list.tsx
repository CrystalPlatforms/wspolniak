// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";

/** Współdzielony klucz zapytania o pełną listę zapisanych postów (strona Biblioteka). */
export const BOOKMARKED_POSTS_KEY = ["bookmarks", "list"] as const;

/** Kształt posta zwracany przez GET /api/app/bookmarks (daty po JSON = ISO string). */
interface SavedPost {
	id: string;
	description: string | null;
	createdAt: string;
	author: { id: string; name: string };
}

/** Pobiera zapisane posty zalogowanego użytkownika (najnowsze pierwsze). */
async function fetchBookmarkedPosts(): Promise<SavedPost[]> {
	const res = await fetch("/api/app/bookmarks");
	if (!res.ok) throw new Error("Nie udało się pobrać zapisanych postów");
	const json = (await res.json()) as { data: SavedPost[] };
	return json.data;
}

/**
 * Lista zapisanych postów (Biblioteka). Sam pobiera dane z GET /api/app/bookmarks
 * i renderuje stany: ładowanie / pusta / lista. Każdy post linkuje do pełnego widoku.
 */
export function BookmarksList() {
	const { data: posts, isPending } = useQuery({
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

	if (!posts || posts.length === 0) {
		return <p className="py-12 text-center text-muted-foreground">Brak zapisanych postów</p>;
	}

	return (
		<div className="space-y-4">
			{posts.map((post) => (
				<a
					key={post.id}
					href={`/app/post/${post.id}`}
					className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
				>
					<div className="mb-1 flex items-center gap-2">
						<span className="font-semibold text-foreground">{post.author.name}</span>
						<time className="text-sm text-muted-foreground" dateTime={post.createdAt}>
							{new Date(post.createdAt).toLocaleDateString("pl-PL")}
						</time>
					</div>
					{post.description && <p className="break-words text-foreground">{post.description}</p>}
				</a>
			))}
		</div>
	);
}
