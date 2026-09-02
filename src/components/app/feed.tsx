// SPDX-License-Identifier: AGPL-3.0-or-later
import { RotateCcwIcon } from "lucide-react";
import { PostCard, type PostCardPost } from "@/components/app/post-card";
import { PENDING_SKELETONS, PostCardSkeleton } from "@/components/app/post-card-skeleton";
import { Loader } from "@/components/ui/loader";

interface FeedProps {
	posts: PostCardPost[];
	imageAccountHash: string;
	currentUserId: string;
	currentUserRole: string;
	libraryEnabled?: boolean;
	hasNextPage?: boolean;
	isFetchingNextPage?: boolean;
	onLoadMore?: () => void;
	/** Pierwsza strona danych jeszcze leci (#145) — szkielety zamiast mylącego „Brak postów". */
	isPending?: boolean;
	/** Aktywne zapytanie wyszukiwarki (F7 #185): chowa footer i zmienia empty state. */
	query?: string;
}

export function Feed({
	posts,
	imageAccountHash,
	currentUserId,
	currentUserRole,
	libraryEnabled = true,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
	isPending = false,
	query = "",
}: FeedProps) {
	const queryActive = query.trim() !== "";
	if (isPending) {
		return (
			<div className="space-y-6" aria-busy="true">
				{Array.from({ length: PENDING_SKELETONS }, (_, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: statyczna lista dekoracyjna o stałej długości
					<PostCardSkeleton key={index} />
				))}
			</div>
		);
	}

	if (posts.length === 0) {
		return (
			<div className="py-12 text-center">
				<p className="text-muted-foreground">
					{queryActive ? "Nic nie znaleziono" : "Brak postów"}
				</p>
				{queryActive && (
					<p className="mt-1 text-sm text-muted-foreground">
						Wyczyść wyszukiwanie, żeby wrócić do feedu.
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{posts.map((post) => (
				<PostCard
					key={post.id}
					post={post}
					imageAccountHash={imageAccountHash}
					currentUserId={currentUserId}
					currentUserRole={currentUserRole}
					libraryEnabled={libraryEnabled}
				/>
			))}

			{/* Przy aktywnym wyszukiwaniu footer paginacji nie ma sensu — wraca po wyczyszczeniu. */}
			{!queryActive && (
				<div>
					{isFetchingNextPage && (
						<div className="flex items-center justify-center py-4">
							<Loader loading size={6} />
						</div>
					)}
					{hasNextPage && !isFetchingNextPage && (
						<div className="flex justify-center py-4">
							<button
								type="button"
								onClick={onLoadMore}
								className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
							>
								<RotateCcwIcon className="h-4 w-4" />
								Załaduj więcej
							</button>
						</div>
					)}
					{!hasNextPage && posts.length > 0 && !isFetchingNextPage && (
						<p className="py-4 text-center text-muted-foreground">Koniec</p>
					)}
				</div>
			)}
		</div>
	);
}
