// SPDX-License-Identifier: AGPL-3.0-or-later
export interface Actor {
	userId: string;
	role: string;
}

export interface PostTarget {
	authorId: string;
}

function isOwnerOrAdmin(actor: Actor, ownerId: string): boolean {
	return actor.userId === ownerId || actor.role === "admin";
}

export function canEditPost(actor: Actor, post: PostTarget): boolean {
	return isOwnerOrAdmin(actor, post.authorId);
}

export function canDeletePost(actor: Actor, post: PostTarget): boolean {
	return isOwnerOrAdmin(actor, post.authorId);
}

export interface VideoTarget {
	authorId: string;
}

export function canDeleteVideo(actor: Actor, video: VideoTarget): boolean {
	return isOwnerOrAdmin(actor, video.authorId);
}

export function canPinPost(actor: Actor): boolean {
	return actor.role === "admin";
}

export interface CommentTarget {
	authorId: string;
}

export function canEditComment(actor: Actor, comment: CommentTarget): boolean {
	return isOwnerOrAdmin(actor, comment.authorId);
}

export function canDeleteComment(actor: Actor, comment: CommentTarget): boolean {
	return isOwnerOrAdmin(actor, comment.authorId);
}

export interface AlbumTarget {
	creatorId: string;
}

/** #173: wszystkie mutacje albumu — tylko twórca albo admin. */
export function canManageAlbum(actor: Actor, album: AlbumTarget): boolean {
	return isOwnerOrAdmin(actor, album.creatorId);
}
