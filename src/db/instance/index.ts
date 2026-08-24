// SPDX-License-Identifier: AGPL-3.0-or-later

export type {
	FeatureFlags,
	FeatureFlagsUpdate,
	MaintenanceConfig,
	MaintenanceUpdate,
	YoutubeConnection,
	YoutubeConnectionInput,
	YoutubeRefreshTokenRow,
} from "./queries";
export {
	clearYoutubeConnection,
	completeSetup,
	DEFAULT_FEATURE_FLAGS,
	DEFAULT_MAINTENANCE_CONFIG,
	getFeatureFlags,
	getMaintenanceConfig,
	getShareCode,
	getYoutubeConnection,
	getYoutubeRefreshToken,
	invalidateFeatureFlagsCache,
	invalidateMaintenanceCache,
	isSetupCompleted,
	setShareCode,
	setYoutubeConnection,
	updateFeatureFlags,
	updateMaintenance,
} from "./queries";
export { instanceConfig } from "./table";
