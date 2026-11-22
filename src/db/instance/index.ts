// SPDX-License-Identifier: AGPL-3.0-or-later

export type {
	MaintenanceConfig,
	MaintenanceUpdate,
	YoutubeConnection,
	YoutubeConnectionInput,
	YoutubeRefreshTokenRow,
} from "./queries";
export {
	clearYoutubeConnection,
	completeSetup,
	DEFAULT_MAINTENANCE_CONFIG,
	getMaintenanceConfig,
	getShareCode,
	getYoutubeConnection,
	getYoutubeRefreshToken,
	invalidateMaintenanceCache,
	isSetupCompleted,
	setShareCode,
	setYoutubeConnection,
	updateMaintenance,
} from "./queries";
export { instanceConfig } from "./table";
