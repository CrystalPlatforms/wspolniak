// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconFolder, IconMessageCircle } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { getImageUrl } from "@/images/client";
import { cn } from "@/lib/utils";

interface PostResult {
	id: string;
	description: string;
	authorName: string;
	createdAt: string;
	cfImageId: string | null;
}

interface CommentResult {
	id: string;
	postId: string;
	body: string;
	authorName: string;
	createdAt: string;
}

interface AlbumResult {
	id: string;
	title: string;
	creatorName: string;
	createdAt: string;
}

interface SearchResultsProps {
	query: string;
	posts: PostResult[];
	comments: CommentResult[];
	albums: AlbumResult[];
	accountHash: string;
}

/** Opis posta jako snippet: czysty tekst, max ~120 znaków. */
function snippet(text: string): string {
	const plain = text
		.replace(/<[^>]*>/g, " ")
		.replace(/[#*_`>[\]]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return plain.length > 120 ? `${plain.slice(0, 117)}…` : plain;
}

type SearchTab = "posts" | "albums" | "comments";

const TAB_LABELS: Record<SearchTab, string> = {
	posts: "Posty",
	albums: "Albumy",
	comments: "Komentarze",
};

export function SearchResults({ query, posts, comments, albums, accountHash }: SearchResultsProps) {
	const [activeTab, setActiveTab] = useState<SearchTab>("posts");

	const counts: Record<SearchTab, number> = {
		posts: posts.length,
		albums: albums.length,
		comments: comments.length,
	};
	const tabs: SearchTab[] = ["posts", "albums", "comments"];

	return (
		<div>
			<div role="tablist" aria-label="Grupy wyników" className="mb-4 flex gap-1">
				{tabs.map((tab) => (
					<button
						key={tab}
						type="button"
						role="tab"
						aria-selected={activeTab === tab}
						onClick={() => setActiveTab(tab)}
						className={cn(
							"rounded-full px-3 py-1.5 text-sm transition-colors",
							activeTab === tab
								? "bg-primary font-medium text-primary-foreground"
								: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
						)}
					>
						{TAB_LABELS[tab]}
						<span className="ml-1 tabular-nums opacity-70">{counts[tab]}</span>
					</button>
				))}
			</div>
			<div role="tabpanel" aria-label={TAB_LABELS[activeTab]}>
				{activeTab === "posts" &&
					(posts.length > 0 ? (
						<PostsSection posts={posts} accountHash={accountHash} />
					) : (
						<TabEmpty query={query} />
					))}
				{activeTab === "albums" &&
					(albums.length > 0 ? <AlbumsSection albums={albums} /> : <TabEmpty query={query} />)}
				{activeTab === "comments" &&
					(comments.length > 0 ? (
						<CommentsSection comments={comments} />
					) : (
						<TabEmpty query={query} />
					))}
			</div>
		</div>
	);
}

/** Pusty wynik aktywnego taba — komunikat z frazą. */
function TabEmpty({ query }: { query: string }) {
	return (
		<div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
			<p className="text-muted-foreground">Nic nie znaleziono dla „{query}"</p>
		</div>
	);
}

function PostsSection({ posts, accountHash }: { posts: PostResult[]; accountHash: string }) {
	return (
		<section aria-label="Posty">
			<div className="flex flex-col gap-2">
				{posts.map((post) => (
					<Link
						key={post.id}
						to="/app/post/$id"
						params={{ id: post.id }}
						className="flex gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent"
					>
						{post.cfImageId && (
							<img
								src={getImageUrl({ accountHash, cfImageId: post.cfImageId, variant: "thumbnail" })}
								alt=""
								className="size-14 shrink-0 rounded object-cover"
								loading="lazy"
							/>
						)}
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium text-foreground">
								{snippet(post.description) || "Bez opisu"}
							</p>
							<p className="text-xs text-muted-foreground">
								{post.authorName} ·{" "}
								{new Date(post.createdAt).toLocaleDateString("pl-PL", {
									day: "numeric",
									month: "short",
									year: "numeric",
								})}
							</p>
						</div>
					</Link>
				))}
			</div>
		</section>
	);
}

function CommentsSection({ comments }: { comments: CommentResult[] }) {
	return (
		<section aria-label="Komentarze">
			<div className="flex flex-col gap-2">
				{comments.map((comment) => (
					<Link
						key={comment.id}
						to="/app/post/$id"
						params={{ id: comment.postId }}
						className="flex gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent"
					>
						<IconMessageCircle
							className="size-5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						<div className="min-w-0 flex-1">
							<p className="line-clamp-2 text-sm text-foreground">{comment.body}</p>
							<p className="text-xs text-muted-foreground">
								{comment.authorName} ·{" "}
								{new Date(comment.createdAt).toLocaleDateString("pl-PL", {
									day: "numeric",
									month: "short",
									year: "numeric",
								})}
							</p>
						</div>
					</Link>
				))}
			</div>
		</section>
	);
}

function AlbumsSection({ albums }: { albums: AlbumResult[] }) {
	return (
		<section aria-label="Albumy">
			<div className="flex flex-col gap-2">
				{albums.map((album) => (
					<Link
						key={album.id}
						to="/app/albums/$id"
						params={{ id: album.id }}
						className="flex gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent"
					>
						<IconFolder className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium text-foreground">{album.title}</p>
							<p className="text-xs text-muted-foreground">
								{album.creatorName} ·{" "}
								{new Date(album.createdAt).toLocaleDateString("pl-PL", {
									day: "numeric",
									month: "short",
									year: "numeric",
								})}
							</p>
						</div>
					</Link>
				))}
			</div>
		</section>
	);
}
