// SPDX-License-Identifier: AGPL-3.0-or-later
export type { Bookmark } from "./queries";
export {
	createBookmark,
	deleteBookmark,
	deleteBookmarksByPost,
	listBookmarksForUser,
} from "./queries";
export { type CreateBookmarkRequest, createBookmarkSchema } from "./schema";
export { bookmarks } from "./table";
