// SPDX-License-Identifier: AGPL-3.0-or-later
import { PostFilesList } from "@/components/app/post-files";
import { PostLocation } from "@/components/app/post-location";
import { PostPoll } from "@/components/app/post-poll";
import type { PostFileEntry } from "@/db/post-files/schema";
import type { PostLocationPayload, PostPollData } from "@/db/posts/schema";

interface PostRichContentProps {
	postId: string;
	poll?: PostPollData | null;
	location?: PostLocationPayload | null;
	files?: PostFileEntry[];
	className?: string;
}

/**
 * Wspólny render treści bogatej posta (#241-#243): ankieta z głosowaniem,
 * karta lokalizacji i wiersze plików. Kolejność: pytanie na górze (decyzje
 * rodziny), potem miejsce, na końcu załączniki. Zwraca null, gdy post nie ma
 * żadnej z tych sekcji — karty renderują się dokładnie jak przed #241.
 */
export function PostRichContent({
	postId,
	poll,
	location,
	files,
	className,
}: PostRichContentProps) {
	const hasAny = Boolean(poll || location || (files && files.length > 0));
	if (!hasAny) return null;

	return (
		<div data-post-rich className={className ?? "space-y-3"}>
			{poll && <PostPoll postId={postId} poll={poll} />}
			{location && <PostLocation location={location} />}
			{files && files.length > 0 && <PostFilesList postId={postId} files={files} />}
		</div>
	);
}
