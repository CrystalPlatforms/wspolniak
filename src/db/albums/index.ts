// SPDX-License-Identifier: AGPL-3.0-or-later
export type { Album, AlbumItem, AlbumTile, CreateAlbumResult } from "./queries";
export {
	createAlbum,
	getAlbumById,
	listAlbums,
} from "./queries";
export { type CreateAlbumRequest, createAlbumSchema } from "./schema";
export { albumItems, albums } from "./table";
