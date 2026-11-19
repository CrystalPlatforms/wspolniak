// SPDX-License-Identifier: AGPL-3.0-or-later
export type { Comment, CommentThread, CommentWithAuthor } from "./queries";
export {
	canAddReply,
	countCommentsByPosts,
	countRepliesByComment,
	createComment,
	createReply,
	getCommentById,
	listCommentsByPost,
	MAX_REPLIES_PER_COMMENT,
	softDeleteComment,
	updateCommentBody,
} from "./queries";
export type { CreateReplyRequest } from "./schema";
export { createReplySchema } from "./schema";
export type { CommentMatch } from "./search";
export { searchComments } from "./search";
export { comments } from "./table";
