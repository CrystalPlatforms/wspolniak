// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PostFileEntry } from "@/db/post-files/schema";
import type { PostLocationPayload, PostPollData } from "@/db/posts/schema";

export interface FeedImage {
	id: string;
	postId: string;
	cfImageId: string;
	displayOrder: number;
	createdAt: string;
}

export interface FeedPost {
	id: string;
	authorId: string;
	description: string | null;
	createdAt: string;
	updatedAt: string;
	author: { id: string; name: string };
	images: FeedImage[];
	/** Ankieta z zagregowanymi wynikami (#241) — dokleja enrichPosts w odpowiedzi feedu. */
	poll?: PostPollData | null;
	/** Lokalizacja (#242) — kompaktowa karta z linkiem do map. */
	location?: PostLocationPayload | null;
	/** Załączniki (#243) — wiersze plików pod zdjęciami/wideo. */
	files?: PostFileEntry[];
	commentCount?: number;
	pinned?: boolean;
}

export interface FeedPage {
	data: FeedPost[];
	meta: {
		nextCursor: { createdAt: string; id: string } | null;
		imageAccountHash: string;
	};
}

/** Klucz infinite query feedu w cache TanStack Query. */
export const feedQueryKey = ["posts"] as const;
