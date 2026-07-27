// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from "drizzle-orm";
import { getDb } from "@/db/setup";
import { instanceConfig } from "./table";

export async function isSetupCompleted(): Promise<boolean> {
	const rows = await getDb()
		.select()
		.from(instanceConfig)
		.where(eq(instanceConfig.setupCompleted, true));
	return rows.length > 0;
}

export async function completeSetup(familyName: string) {
	const id = crypto.randomUUID();
	const rows = await getDb()
		.insert(instanceConfig)
		.values({ id, familyName, setupCompleted: true })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("completeSetup: insert returned no rows");
	return row;
}

export const DEFAULT_MAINTENANCE_CONFIG = {
	enabled: false,
	message: "Wspólniak jest w trakcie naprawy",
	subtitle: "Wróć za chwilę",
	icon: "alert-triangle",
} as const;

export interface MaintenanceConfig {
	enabled: boolean;
	message: string;
	subtitle: string;
	icon: string;
}

export interface MaintenanceUpdate {
	enabled?: boolean;
	message?: string;
	subtitle?: string;
	icon?: string;
}

const MAINTENANCE_CACHE_TTL_MS = 60_000;
let maintenanceCache: { data: MaintenanceConfig; expiresAt: number } | null = null;

export function invalidateMaintenanceCache(): void {
	maintenanceCache = null;
}

export async function getMaintenanceConfig(): Promise<MaintenanceConfig> {
	if (maintenanceCache && maintenanceCache.expiresAt > Date.now()) {
		return maintenanceCache.data;
	}
	const rows = await getDb()
		.select({
			maintenanceMode: instanceConfig.maintenanceMode,
			maintenanceMessage: instanceConfig.maintenanceMessage,
			maintenanceSubtitle: instanceConfig.maintenanceSubtitle,
			maintenanceIcon: instanceConfig.maintenanceIcon,
		})
		.from(instanceConfig)
		.limit(1);
	const row = rows[0];
	const config: MaintenanceConfig = {
		enabled: row?.maintenanceMode ?? DEFAULT_MAINTENANCE_CONFIG.enabled,
		message: row?.maintenanceMessage ?? DEFAULT_MAINTENANCE_CONFIG.message,
		subtitle: row?.maintenanceSubtitle ?? DEFAULT_MAINTENANCE_CONFIG.subtitle,
		icon: row?.maintenanceIcon ?? DEFAULT_MAINTENANCE_CONFIG.icon,
	};
	maintenanceCache = { data: config, expiresAt: Date.now() + MAINTENANCE_CACHE_TTL_MS };
	return config;
}

export async function updateMaintenance(input: MaintenanceUpdate): Promise<void> {
	const rows = await getDb().select({ id: instanceConfig.id }).from(instanceConfig).limit(1);
	const row = rows[0];
	if (!row) throw new Error("updateMaintenance: no instance_config row");

	const set: Record<string, unknown> = {};
	if (input.enabled !== undefined) set.maintenanceMode = input.enabled;
	if (input.message !== undefined) set.maintenanceMessage = input.message;
	if (input.subtitle !== undefined) set.maintenanceSubtitle = input.subtitle;
	if (input.icon !== undefined) set.maintenanceIcon = input.icon;

	if (Object.keys(set).length > 0) {
		await getDb().update(instanceConfig).set(set).where(eq(instanceConfig.id, row.id));
	}
	invalidateMaintenanceCache();
}

// --- YouTube connection (Wspólniak Wideo) ---------------------------------
// Storage only. The refresh token is stored as an opaque encrypted blob and
// never selected by these functions — only the `youtube` module decrypts it.

export interface YoutubeConnection {
	connected: boolean;
	channelId: string | null;
	channelTitle: string | null;
	connectedAt: Date | null;
	connectedBy: string | null;
}

export interface YoutubeConnectionInput {
	channelId: string;
	channelTitle: string;
	encryptedRefreshToken: string;
	connectedBy: string;
}

async function getInstanceConfigId(): Promise<string> {
	const rows = await getDb().select({ id: instanceConfig.id }).from(instanceConfig).limit(1);
	const row = rows[0];
	if (!row) throw new Error("getInstanceConfigId: no instance_config row");
	return row.id;
}

export async function getYoutubeConnection(): Promise<YoutubeConnection> {
	const rows = await getDb()
		.select({
			channelId: instanceConfig.youtubeChannelId,
			channelTitle: instanceConfig.youtubeChannelTitle,
			connectedAt: instanceConfig.youtubeConnectedAt,
			connectedBy: instanceConfig.youtubeConnectedBy,
		})
		.from(instanceConfig)
		.limit(1);
	const row = rows[0];
	return {
		connected: Boolean(row?.channelId),
		channelId: row?.channelId ?? null,
		channelTitle: row?.channelTitle ?? null,
		connectedAt: row?.connectedAt ?? null,
		connectedBy: row?.connectedBy ?? null,
	};
}

export interface YoutubeRefreshTokenRow {
	encryptedRefreshToken: string;
	channelId: string;
}

/**
 * Zwraca zaszyfrowany refresh token + channelId (do rozszyfrowania przez moduł
 * `youtube` przy uploadzie). `null`, gdy instancja nie ma połączenia z YouTube.
 * Token NIE jest tu odszyfrowywany — deszyfracja żyje tylko w `core/youtube`.
 */
export async function getYoutubeRefreshToken(): Promise<YoutubeRefreshTokenRow | null> {
	const rows = await getDb()
		.select({
			encryptedRefreshToken: instanceConfig.youtubeRefreshToken,
			channelId: instanceConfig.youtubeChannelId,
		})
		.from(instanceConfig)
		.limit(1);
	const row = rows[0];
	if (!row?.encryptedRefreshToken || !row?.channelId) return null;
	return {
		encryptedRefreshToken: row.encryptedRefreshToken,
		channelId: row.channelId,
	};
}

export async function setYoutubeConnection(input: YoutubeConnectionInput): Promise<void> {
	const id = await getInstanceConfigId();
	await getDb()
		.update(instanceConfig)
		.set({
			youtubeChannelId: input.channelId,
			youtubeChannelTitle: input.channelTitle,
			youtubeRefreshToken: input.encryptedRefreshToken,
			youtubeConnectedAt: new Date(),
			youtubeConnectedBy: input.connectedBy,
		})
		.where(eq(instanceConfig.id, id));
}

export async function clearYoutubeConnection(): Promise<void> {
	const id = await getInstanceConfigId();
	await getDb()
		.update(instanceConfig)
		.set({
			youtubeChannelId: null,
			youtubeChannelTitle: null,
			youtubeRefreshToken: null,
			youtubeConnectedAt: null,
			youtubeConnectedBy: null,
		})
		.where(eq(instanceConfig.id, id));
}
