// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, MessageCircleIcon, PinIcon } from "lucide-react";
import { useState } from "react";
import { BookmarkButton } from "@/components/app/bookmark-button";
import { EmojiReactions } from "@/components/app/emoji-reactions";
import { FadeImage } from "@/components/app/fade-image";
import { ImageLightbox } from "@/components/app/image-lightbox";
import { MarkdownText } from "@/components/app/markdown-text";
import { PostActions } from "@/components/app/post-actions";
import {
	SkeletonDescription,
	SkeletonHeader,
	SkeletonMeta,
} from "@/components/app/post-card-skeleton";
import { PostWhoReacted } from "@/components/app/post-who-reacted";
import { VideoThumb } from "@/components/video/video-thumb";
import { useBootSequence } from "@/core/boot-sequence";
import { getImageUrl } from "@/images/client";

const MAX_FEED_IMAGES = 2;

/** Etapy choreografii karty (#145): nagłówek+opis → reakcje+komentarze → media. */
export const POST_CARD_STAGES = ["text", "reactions", "photos"] as const;
export type PostCardStage = (typeof POST_CARD_STAGES)[number];

export interface PostCardImage {
	id: string;
	postId: string;
	cfImageId: string;
	displayOrder: number;
	createdAt: string;
}

export interface PostCardVideo {
	id: string;
	title: string;
	thumbnailUrl: string;
	position: number;
}

export interface PostCardPost {
	id: string;
	authorId: string;
	description: string | null;
	createdAt: string;
	updatedAt: string;
	author: { id: string; name: string };
	images: PostCardImage[];
	videos?: PostCardVideo[];
	commentCount?: number;
	pinned?: boolean;
}

interface PostCardProps {
	post: PostCardPost;
	imageAccountHash: string;
	currentUserId: string;
	currentUserRole: string;
	libraryEnabled?: boolean;
}

/**
 * Pojedyncza karta posta — współdzielona przez feed i Bibliotekę (#127).
 * Hermetyzuje własny lightbox, by rodzic (Feed / BookmarksList) był prostym mapem.
 * Od #145 zarządza też sekwencją odsłaniania (useBootSequence): zimny start
 * pokazuje szkielety etapów, warm (nawigacja kliencka) — pełną treść od razu.
 * Zdjęcia pobierają się równolegle od montażu (lazy); placeholder wygasa
 * płynnym fade'em (#146), gdy zdjęcie jest załadowane ORAZ etap reactions
 * już widoczny (kolejność wymuszona).
 */
export function PostCard({
	post,
	imageAccountHash,
	currentUserId,
	currentUserRole,
	libraryEnabled = true,
}: PostCardProps) {
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	const [loadedImages, setLoadedImages] = useState<ReadonlySet<string>>(() => new Set());

	const canManage = post.authorId === currentUserId || currentUserRole === "admin";
	const visibleImages = post.images.slice(0, MAX_FEED_IMAGES);
	const remaining = post.images.length - MAX_FEED_IMAGES;

	const allImagesLoaded = visibleImages.length === 0 || loadedImages.size >= visibleImages.length;
	const visible = useBootSequence<PostCardStage>(POST_CARD_STAGES, {
		text: true,
		reactions: true,
		photos: allImagesLoaded,
	});

	const registerImageLoad = (imageId: string) => {
		setLoadedImages((prev) => {
			if (prev.has(imageId)) return prev;
			const next = new Set(prev);
			next.add(imageId);
			return next;
		});
	};

	const lightboxImages = post.images.map((img) => ({
		id: img.id,
		src: getImageUrl({
			accountHash: imageAccountHash,
			cfImageId: img.cfImageId,
			variant: "public",
		}),
		alt: `Zdjęcie ${img.displayOrder + 1}`,
	}));

	return (
		<article
			className={`relative rounded-lg border bg-card p-4 ${
				post.pinned ? "border-2 border-primary" : "border-border"
			}`}
		>
			{post.pinned && (
				<span
					role="img"
					aria-label="Przypięty post"
					className="absolute -top-2 -left-2 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
				>
					<PinIcon className="size-4" />
				</span>
			)}

			{visible.text ? (
				<>
					<div className="mb-2 flex items-center gap-2">
						<span className="font-semibold text-foreground">{post.author.name}</span>
						<time className="text-sm text-muted-foreground" dateTime={post.createdAt}>
							{formatRelativeTime(post.createdAt)}
						</time>
						<div className="ml-auto flex items-center gap-1">
							{libraryEnabled && <BookmarkButton postId={post.id} />}
							<PostWhoReacted target={{ kind: "post", postId: post.id }} />
							{canManage && (
								<PostActions
									postId={post.id}
									description={post.description}
									isAdmin={currentUserRole === "admin"}
									pinned={post.pinned}
								/>
							)}
						</div>
					</div>

					{post.description && (
						<MarkdownText text={post.description} className="mb-3 break-words text-foreground" />
					)}
				</>
			) : (
				<>
					<SkeletonHeader />
					{post.description !== null && <SkeletonDescription />}
				</>
			)}

			{visibleImages.length > 0 && (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{visibleImages.map((image, index) => {
						const showOverlay = index === 1 && remaining > 0;
						const mediaVisible = visible.reactions && loadedImages.has(image.id);
						return (
							<button
								key={image.id}
								type="button"
								onClick={() => setLightboxIndex(index)}
								className="relative overflow-hidden rounded-md"
							>
								<FadeImage
									src={getImageUrl({
										accountHash: imageAccountHash,
										cfImageId: image.cfImageId,
										variant: "thumbnail",
									})}
									alt={`Zdjęcie ${image.displayOrder + 1}`}
									className="aspect-square w-full object-cover transition-transform hover:scale-105"
									reveal={mediaVisible}
									onImageLoad={() => registerImageLoad(image.id)}
								/>
								{showOverlay && mediaVisible && (
									<span className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-semibold text-white">
										+{remaining} więcej
									</span>
								)}
							</button>
						);
					})}
				</div>
			)}

			{visible.photos && post.videos && post.videos.length > 0 && (
				<div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
					{post.videos.map((video) => (
						<VideoThumb
							key={video.id}
							id={video.id}
							title={video.title}
							thumbnailUrl={video.thumbnailUrl}
						/>
					))}
				</div>
			)}

			{visible.reactions ? (
				<div className="mt-3 flex items-center justify-between">
					<div className="flex items-center gap-1">
						<Link
							to="/app/post/$id"
							params={{ id: post.id }}
							hash="comments"
							className="flex items-center gap-1.5 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:gap-1 sm:px-2 sm:py-1"
						>
							<MessageCircleIcon className="size-6 sm:size-4" />
							{post.commentCount ?? 0}
						</Link>
						<EmojiReactions target={{ kind: "post", postId: post.id }} />
					</div>
					<Link
						to="/app/post/$id"
						params={{ id: post.id }}
						className="flex items-center gap-1.5 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:gap-1 sm:px-2 sm:py-1"
						aria-label="Otwórz pełny post"
					>
						<ExternalLinkIcon className="size-6 sm:size-4" />
						<span className="sm:hidden">Otwórz</span>
						<span className="hidden sm:inline">Otwórz pełny post</span>
					</Link>
				</div>
			) : (
				<SkeletonMeta />
			)}

			{lightboxImages.length > 0 && (
				<ImageLightbox
					images={lightboxImages}
					initialIndex={lightboxIndex ?? 0}
					open={lightboxIndex !== null}
					onClose={() => setLightboxIndex(null)}
				/>
			)}
		</article>
	);
}

function formatRelativeTime(isoDate: string): string {
	const date = new Date(isoDate);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMin = Math.floor(diffMs / 60_000);

	if (diffMin < 1) return "przed chwilą";
	if (diffMin < 60) return `${diffMin} min temu`;
	const diffHours = Math.floor(diffMin / 60);
	if (diffHours < 24) return `${diffHours} godz. temu`;
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 7) return `${diffDays} dn. temu`;

	return date.toLocaleDateString("pl-PL");
}
