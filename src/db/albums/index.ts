// SPDX-License-Identifier: AGPL-3.0-or-later
export type {
	AddableAlbum,
	Album,
	AlbumItem,
	AlbumTile,
	CreateAlbumResult,
} from "./queries";
export {
	addAlbumItems,
	createAlbum,
	getAlbumById,
	listAddableAlbums,
	listAlbums,
} from "./queries";
export {
	type AddAlbumItemsRequest,
	ALBUM_ITEM_KINDS,
	type AlbumItemKind,
	addAlbumItemsSchema,
	type CreateAlbumRequest,
	createAlbumSchema,
} from "./schema";
export { albumItems, albums } from "./table";
