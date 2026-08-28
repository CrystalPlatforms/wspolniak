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
	deleteAlbum,
	deleteAlbumItemsByRefs,
	getAlbumById,
	getNewestAlbumCreatedAt,
	listAddableAlbums,
	listAlbums,
	removeAlbumItem,
	renameAlbum,
	setAlbumCover,
} from "./queries";
export {
	type AddAlbumItemsRequest,
	ALBUM_ITEM_KINDS,
	type AlbumItemKind,
	addAlbumItemsSchema,
	type CreateAlbumRequest,
	createAlbumSchema,
	MAX_ALBUM_ITEMS,
	type UpdateAlbumRequest,
	updateAlbumSchema,
} from "./schema";
export { albumItems, albums } from "./table";
