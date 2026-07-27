// SPDX-License-Identifier: AGPL-3.0-or-later
export type {
	CreateVideoInput,
	ListPaginatedVideosInput,
	ListPaginatedVideosResult,
	Video,
	VideoFeedItem,
	VideoListCursor,
} from "./queries";
export {
	countTodayUTC,
	createVideo,
	DAILY_VIDEO_LIMIT,
	getVideoById,
	listPaginatedVideos,
	utcDayStart,
} from "./queries";
export type { ConfirmVideoRequest, StartUploadRequest } from "./schema";
export { confirmVideoSchema, MAX_VIDEO_BYTES, startUploadSchema } from "./schema";
export { videos } from "./table";
