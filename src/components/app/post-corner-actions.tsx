// SPDX-License-Identifier: AGPL-3.0-or-later
import { useNavigate } from "@tanstack/react-router";
import { PostActions } from "@/components/app/post-actions";
import { ShareToChatButton } from "@/components/app/share-to-chat-button";
import { encodeChatDraft } from "@/components/chat/chat-draft";

interface PostCornerActionsProps {
	postId: string;
	/** Własny post (lub admin) → menu „..."; cudzy → ikona udostępniania w tym samym rogu. */
	canManage: boolean;
	isAdmin: boolean;
	description: string | null;
	pinned?: boolean;
	onDeleted?: () => void;
	/** Czat włączony (F5 #218) — bez niego brak ścieżki udostępniania na czacie. */
	chatEnabled: boolean;
}

/**
 * Prawy górny róg karty posta (F5 #218): we własnym poście menu „..." z pozycją
 * „Wspomnij na czacie"; w cudzym — osobna ikona dokładnie w tym samym miejscu.
 * Oba wejścia prowadzą do czatu z draftem posta (wysyłka ręczna w composerze).
 */
export function PostCornerActions({
	postId,
	canManage,
	isAdmin,
	description,
	pinned,
	onDeleted,
	chatEnabled,
}: PostCornerActionsProps) {
	const navigate = useNavigate();

	/** Udostępnienie posta na czacie: draft przez URL, czat resolvuje podgląd. */
	function shareToChat() {
		void navigate({
			to: "/app/chat",
			search: { draft: encodeChatDraft({ type: "post", postId }) },
		});
	}

	if (canManage) {
		return (
			<PostActions
				postId={postId}
				description={description}
				onDeleted={onDeleted}
				isAdmin={isAdmin}
				pinned={pinned}
				onShareToChat={chatEnabled ? shareToChat : undefined}
			/>
		);
	}
	if (!chatEnabled) return null;
	return <ShareToChatButton onClick={shareToChat} />;
}
