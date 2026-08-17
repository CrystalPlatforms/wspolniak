// SPDX-License-Identifier: AGPL-3.0-or-later
import { RotateCcwIcon } from "lucide-react";
import { PostCard, type PostCardPost } from "@/components/app/post-card";
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
}: FeedProps) {
	if (posts.length === 0) {
		return (
			<div className="py-12 text-center">
				<p className="text-muted-foreground">Brak postów</p>
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
		</div>
	);
}
