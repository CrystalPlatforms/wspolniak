// SPDX-License-Identifier: AGPL-3.0-or-later
// YouTube integration — OAuth token lifecycle + at-rest encryption.
// Pure module: callers pass a YoutubeConfig (derived from env) and the stored
// token; nothing here touches the database (storage lives on the `instance` domain).

export {
	decryptRefreshToken,
	encryptRefreshToken,
	importEncryptionKey,
} from "./crypto";
export {
	buildAuthorizationUrl,
	createState,
	exchangeCodeForTokens,
	fetchOwnChannel,
	refreshAccessToken,
	verifyState,
	type YoutubeConfig,
} from "./oauth";
export {
	type ChunkRange,
	type ForwardChunkResult,
	forwardChunk,
	pickThumbnail,
	type StartUploadMeta,
	startResumableUpload,
} from "./upload";
export { deleteVideo } from "./videos";
