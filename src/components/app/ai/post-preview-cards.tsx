// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from "@tanstack/react-router";
import { ImageOff } from "lucide-react";
import type { PostPreview } from "@/core/ai/stream-protocol";
import { cn } from "@/lib/utils";

interface PostPreviewCardsProps {
	posts: PostPreview[];
}

/**
 * Karty podglądu postów (F5 #183) — klikalne, pod odpowiedzią AL. Miniatura
 * (Cloudflare Images, wariant thumbnail) z napisem „Zobacz post", tytuł
 * (pierwsza linia opisu), autor i data; kliknięcie otwiera post. Brak zdjęć
 * = placeholder z ikoną i napisem — karta nigdy nie jest pusta.
 */
export function PostPreviewCards({ posts }: PostPreviewCardsProps) {
	return (
		<div className="mt-2 flex flex-col gap-1.5">
			{posts.map((post) => (
				<Link
					key={post.id}
					to="/app/post/$id"
					params={{ id: post.id }}
					className={cn(
						"flex items-center gap-3 rounded-xl border border-border bg-card p-2",
						"transition-colors hover:border-primary/50",
					)}
				>
					<span className="relative size-12 shrink-0 overflow-hidden rounded-lg">
						{post.thumbnail ? (
							<img
								src={post.thumbnail}
								alt=""
								loading="lazy"
								className="size-12 rounded-lg object-cover"
							/>
						) : (
							<span className="flex size-12 flex-col items-center justify-center gap-0.5 rounded-lg bg-muted">
								<ImageOff className="size-4 text-muted-foreground" />
								<span className="text-[9px] leading-none text-muted-foreground">Brak zdjęcia</span>
							</span>
						)}
						<span className="absolute inset-x-0 bottom-0 bg-background/80 py-px text-center text-[9px] leading-tight text-foreground">
							Zobacz post
						</span>
					</span>
					<span className="min-w-0">
						<span className="block truncate text-sm font-medium text-foreground">{post.title}</span>
						<span className="block text-xs text-muted-foreground">
							{post.author} · {new Date(post.date).toLocaleDateString("pl-PL")}
						</span>
					</span>
				</Link>
			))}
		</div>
	);
}
