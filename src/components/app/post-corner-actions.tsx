// SPDX-License-Identifier: AGPL-3.0-or-later
import { PostActions } from "@/components/app/post-actions";

interface PostCornerActionsProps {
	postId: string;
	/** Własny post (lub admin) → menu „..."; cudzy → brak akcji w rogu. */
	canManage: boolean;
	isAdmin: boolean;
	description: string | null;
	pinned?: boolean;
	onDeleted?: () => void;
}

/**
 * Prawy górny róg karty posta: we własnym poście menu „..." (edycja, przypięcie,
 * usunięcie). Ścieżka udostępniania na czacie usunięta razem z czatem (#245) —
 * w cudzych postach róg pozostaje pusty.
 */
export function PostCornerActions({
	postId,
	canManage,
	isAdmin,
	description,
	pinned,
	onDeleted,
}: PostCornerActionsProps) {
	if (!canManage) return null;
	return (
		<PostActions
			postId={postId}
			description={description}
			onDeleted={onDeleted}
			isAdmin={isAdmin}
			pinned={pinned}
		/>
	);
}
