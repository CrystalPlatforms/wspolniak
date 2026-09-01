// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from "drizzle-orm";
import {
	clearYoutubeConnection,
	completeSetup,
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
import { instanceConfig } from "./table";

vi.mock("@/db/setup", () => ({
	getDb: vi.fn(),
}));

import { getDb } from "@/db/setup";

const mockGetDb = vi.mocked(getDb);

describe("isSetupCompleted", () => {
	it("returns false when no instance_config rows exist", async () => {
		const mockSelect = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			}),
		});
		mockGetDb.mockReturnValue({ select: mockSelect } as never);

		const result = await isSetupCompleted();
		expect(result).toBe(false);
	});

	it("returns true when a completed config row exists", async () => {
		const mockSelect = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([{ setupCompleted: true }]),
			}),
		});
		mockGetDb.mockReturnValue({ select: mockSelect } as never);

		const result = await isSetupCompleted();
		expect(result).toBe(true);
	});
});

describe("completeSetup", () => {
	it("inserts a row with familyName and setupCompleted=true", async () => {
		const mockReturning = vi.fn().mockResolvedValue([
			{
				id: "some-id",
				familyName: "Kowalscy",
				setupCompleted: true,
			},
		]);
		const mockInsert = vi.fn().mockReturnValue({
			values: vi.fn().mockReturnValue({ returning: mockReturning }),
		});
		mockGetDb.mockReturnValue({ insert: mockInsert } as never);

		const result = await completeSetup("Kowalscy");

		expect(mockInsert).toHaveBeenCalledWith(instanceConfig);
		expect(result.familyName).toBe("Kowalscy");
		expect(result.setupCompleted).toBe(true);
	});
});

describe("maintenance config", () => {
	beforeEach(() => invalidateMaintenanceCache());

	function mockSelectRow(row: Record<string, unknown>) {
		const limit = vi.fn().mockResolvedValue([row]);
		const from = vi.fn().mockReturnValue({ limit });
		const select = vi.fn().mockReturnValue({ from });
		mockGetDb.mockReturnValue({ select } as never);
		return { select, from, limit };
	}

	it("returns defaults when maintenance fields are null", async () => {
		mockSelectRow({
			maintenanceMode: false,
			maintenanceMessage: null,
			maintenanceSubtitle: null,
			maintenanceIcon: null,
		});

		const config = await getMaintenanceConfig();

		expect(config).toEqual({
			enabled: false,
			message: "Wspólniak jest w trakcie naprawy",
			subtitle: "Wróć za chwilę",
			icon: "alert-triangle",
		});
	});

	it("returns stored values when fields are set", async () => {
		mockSelectRow({
			maintenanceMode: true,
			maintenanceMessage: "Chwila przerwy",
			maintenanceSubtitle: "Wracamy niedługo",
			maintenanceIcon: "wrench",
		});

		const config = await getMaintenanceConfig();

		expect(config).toEqual({
			enabled: true,
			message: "Chwila przerwy",
			subtitle: "Wracamy niedługo",
			icon: "wrench",
		});
	});

	it("serves cached config on second call without hitting DB again", async () => {
		const { select } = mockSelectRow({ maintenanceMode: false });

		await getMaintenanceConfig();
		await getMaintenanceConfig();

		expect(select).toHaveBeenCalledTimes(1);
	});

	it("re-reads DB after cache is invalidated", async () => {
		const { select } = mockSelectRow({ maintenanceMode: false });

		await getMaintenanceConfig();
		invalidateMaintenanceCache();
		await getMaintenanceConfig();

		expect(select).toHaveBeenCalledTimes(2);
	});
});

describe("feature flags", () => {
	beforeEach(() => invalidateFeatureFlagsCache());

	function mockSelectRow(row: Record<string, unknown>) {
		const limit = vi.fn().mockResolvedValue([row]);
		const from = vi.fn().mockReturnValue({ limit });
		const select = vi.fn().mockReturnValue({ from });
		mockGetDb.mockReturnValue({ select } as never);
		return { select, from, limit };
	}

	it("returns both features enabled when columns are true", async () => {
		mockSelectRow({
			videoEnabled: true,
			markdownEnabled: true,
			libraryEnabled: true,
			chatEnabled: true,
			albumsEnabled: true,
			aiEnabled: true,
		});

		const flags = await getFeatureFlags();

		expect(flags).toEqual({
			video: true,
			markdown: true,
			library: true,
			chat: true,
			albums: true,
			ai: true,
		});
	});

	it("returns a disabled flag when its column is false", async () => {
		mockSelectRow({
			videoEnabled: false,
			markdownEnabled: true,
			libraryEnabled: true,
			chatEnabled: true,
			albumsEnabled: true,
			aiEnabled: true,
		});

		const flags = await getFeatureFlags();

		expect(flags).toEqual({
			video: false,
			markdown: true,
			library: true,
			chat: true,
			albums: true,
			ai: true,
		});
	});

	// F8 #159: flaga czatu — domyślnie true, kolumna chat_enabled.
	it("returns a disabled chat flag when its column is false", async () => {
		mockSelectRow({
			videoEnabled: true,
			markdownEnabled: true,
			libraryEnabled: true,
			chatEnabled: false,
			albumsEnabled: true,
		});

		const flags = await getFeatureFlags();

		expect(flags.chat).toBe(false);
	});

	it("defaults to enabled when columns are null (no opinion stored yet)", async () => {
		mockSelectRow({
			videoEnabled: null,
			markdownEnabled: null,
			libraryEnabled: null,
			chatEnabled: null,
			albumsEnabled: true,
		});

		const flags = await getFeatureFlags();

		expect(flags).toEqual({
			video: true,
			markdown: true,
			library: true,
			chat: true,
			albums: true,
			ai: false,
		});
	});

	// F1 #179: AL — jedyny flag domyślnie WYŁĄCZONY (AI nie działa bez zgody admina).
	it("defaults the ai flag to disabled when its column is null", async () => {
		mockSelectRow({
			videoEnabled: true,
			markdownEnabled: true,
			libraryEnabled: true,
			chatEnabled: true,
			albumsEnabled: true,
			aiEnabled: null,
		});

		const flags = await getFeatureFlags();

		expect(flags.ai).toBe(false);
	});

	it("serves cached flags on second call without hitting DB again", async () => {
		const { select } = mockSelectRow({
			videoEnabled: true,
			markdownEnabled: true,
			libraryEnabled: true,
		});

		await getFeatureFlags();
		await getFeatureFlags();

		expect(select).toHaveBeenCalledTimes(1);
	});

	it("re-reads DB after the cache is invalidated", async () => {
		const { select } = mockSelectRow({
			videoEnabled: false,
			markdownEnabled: true,
			libraryEnabled: true,
		});

		await getFeatureFlags();
		invalidateFeatureFlagsCache();
		await getFeatureFlags();

		expect(select).toHaveBeenCalledTimes(2);
	});
});

describe("updateFeatureFlags", () => {
	beforeEach(() => invalidateFeatureFlagsCache());

	function mockUpdateById(rowId: string) {
		const limit = vi.fn().mockResolvedValue([{ id: rowId }]);
		const from = vi.fn().mockReturnValue({ limit });
		const select = vi.fn().mockReturnValue({ from });
		const where = vi.fn().mockResolvedValue([]);
		const set = vi.fn().mockReturnValue({ where });
		const update = vi.fn().mockReturnValue({ set });
		mockGetDb.mockReturnValue({ select, update } as never);
		return { select, update, set };
	}

	it("persists both flags when provided", async () => {
		const { set } = mockUpdateById("inst-1");

		await updateFeatureFlags({
			video: false,
			markdown: false,
			library: false,
			chat: false,
			albums: true,
		});

		expect(set).toHaveBeenCalledWith({
			videoEnabled: false,
			markdownEnabled: false,
			libraryEnabled: false,
			chatEnabled: false,
			albumsEnabled: true,
		});
	});

	it("persists only provided fields and ignores undefined", async () => {
		const { set } = mockUpdateById("inst-1");

		await updateFeatureFlags({ video: false });

		expect(set).toHaveBeenCalledWith({ videoEnabled: false });
	});

	it("throws when no instance_config row exists", async () => {
		const limit = vi.fn().mockResolvedValue([]);
		const from = vi.fn().mockReturnValue({ limit });
		const select = vi.fn().mockReturnValue({ from });
		mockGetDb.mockReturnValue({ select, update: vi.fn() } as never);

		await expect(updateFeatureFlags({ video: false })).rejects.toThrow(/no instance_config row/i);
	});

	it("invalidates the cache so the next read sees fresh values", async () => {
		let dbRow: Record<string, unknown> = {
			id: "inst-1",
			videoEnabled: true,
			markdownEnabled: true,
			libraryEnabled: true,
		};
		const limit = vi.fn().mockImplementation(() => Promise.resolve([dbRow]));
		const from = vi.fn().mockReturnValue({ limit });
		const select = vi.fn().mockReturnValue({ from });
		const where = vi.fn().mockResolvedValue([]);
		const set = vi.fn().mockReturnValue({ where });
		const update = vi.fn().mockReturnValue({ set });
		mockGetDb.mockReturnValue({ select, update } as never);

		const first = await getFeatureFlags();
		expect(first.video).toBe(true);

		dbRow = { id: "inst-1", videoEnabled: false, markdownEnabled: true, libraryEnabled: true }; // persisted change
		await updateFeatureFlags({ video: false }); // invalidates cache

		const second = await getFeatureFlags();
		expect(second.video).toBe(false);
	});
});

describe("updateMaintenance", () => {
	beforeEach(() => invalidateMaintenanceCache());

	function mockUpdateById(rowId: string) {
		const limit = vi.fn().mockResolvedValue([{ id: rowId }]);
		const from = vi.fn().mockReturnValue({ limit });
		const select = vi.fn().mockReturnValue({ from });

		const where = vi.fn().mockResolvedValue([]);
		const set = vi.fn().mockReturnValue({ where });
		const update = vi.fn().mockReturnValue({ set });

		mockGetDb.mockReturnValue({ select, update } as never);
		return { select, update, set };
	}

	it("persists provided fields on the instance_config row", async () => {
		const { set } = mockUpdateById("inst-1");

		await updateMaintenance({ enabled: true, message: "X", subtitle: "Y", icon: "wrench" });

		expect(set).toHaveBeenCalledWith({
			maintenanceMode: true,
			maintenanceMessage: "X",
			maintenanceSubtitle: "Y",
			maintenanceIcon: "wrench",
		});
	});

	it("persists only provided fields and ignores undefined", async () => {
		const { set } = mockUpdateById("inst-1");

		await updateMaintenance({ enabled: true });

		expect(set).toHaveBeenCalledWith({ maintenanceMode: true });
	});

	it("throws when no instance_config row exists", async () => {
		mockUpdateById(""); // select returns [] -> row undefined
		const limit = vi.fn().mockResolvedValue([]);
		const from = vi.fn().mockReturnValue({ limit });
		const select = vi.fn().mockReturnValue({ from });
		const update = vi.fn();
		mockGetDb.mockReturnValue({ select, update } as never);

		await expect(updateMaintenance({ enabled: true })).rejects.toThrow(/no instance_config row/i);
	});

	it("re-reads fresh values after update invalidates cache", async () => {
		let dbRow: Record<string, unknown> = { maintenanceMode: false, id: "inst-1" };
		const limit = vi.fn().mockImplementation(() => Promise.resolve([dbRow]));
		const from = vi.fn().mockReturnValue({ limit });
		const select = vi.fn().mockReturnValue({ from });
		const where = vi.fn().mockResolvedValue([]);
		const set = vi.fn().mockReturnValue({ where });
		const update = vi.fn().mockReturnValue({ set });
		mockGetDb.mockReturnValue({ select, update } as never);

		const first = await getMaintenanceConfig();
		expect(first.enabled).toBe(false);

		dbRow = { maintenanceMode: true, id: "inst-1" }; // simulate persisted change
		await updateMaintenance({ enabled: true }); // invalidates cache

		const second = await getMaintenanceConfig();
		expect(second.enabled).toBe(true);
	});
});

describe("YouTube connection storage", () => {
	function mockSelectRow(row: Record<string, unknown>) {
		const limit = vi.fn().mockResolvedValue([row]);
		const from = vi.fn().mockReturnValue({ limit });
		const select = vi.fn().mockReturnValue({ from });
		mockGetDb.mockReturnValue({ select } as never);
		return { select };
	}

	describe("getYoutubeConnection", () => {
		it("reports disconnected when no channel id is stored", async () => {
			mockSelectRow({
				channelId: null,
				channelTitle: null,
				connectedAt: null,
				connectedBy: null,
			});

			const conn = await getYoutubeConnection();

			expect(conn).toEqual({
				connected: false,
				channelId: null,
				channelTitle: null,
				connectedAt: null,
				connectedBy: null,
			});
		});

		it("reports connected with stored values", async () => {
			const at = new Date("2026-07-23T10:00:00Z");
			mockSelectRow({
				channelId: "UC123",
				channelTitle: "Wspólniak Wideo",
				connectedAt: at,
				connectedBy: "admin-1",
			});

			const conn = await getYoutubeConnection();

			expect(conn.connected).toBe(true);
			expect(conn.channelId).toBe("UC123");
			expect(conn.channelTitle).toBe("Wspólniak Wideo");
			expect(conn.connectedBy).toBe("admin-1");
		});

		it("never returns the refresh token (stays inside the youtube module)", async () => {
			const { select } = mockSelectRow({ channelId: "UC123" });

			await getYoutubeConnection();

			// the select must not touch the refresh token column
			expect(select).toHaveBeenCalledWith(
				expect.not.objectContaining({ youtubeRefreshToken: expect.anything() }),
			);
		});
	});

	describe("getYoutubeRefreshToken", () => {
		it("returns the encrypted token + channelId when connected", async () => {
			mockSelectRow({ encryptedRefreshToken: "enc-blob", channelId: "UC123" });

			const row = await getYoutubeRefreshToken();

			expect(row).toEqual({ encryptedRefreshToken: "enc-blob", channelId: "UC123" });
		});

		it("returns null when no refresh token is stored (not connected)", async () => {
			mockSelectRow({ encryptedRefreshToken: null, channelId: null });

			expect(await getYoutubeRefreshToken()).toBeNull();
		});
	});

	function mockUpdateById(rowId: string) {
		const idLimit = vi.fn().mockResolvedValue([{ id: rowId }]);
		const idFrom = vi.fn().mockReturnValue({ limit: idLimit });
		const select = vi.fn().mockReturnValue({ from: idFrom });

		const where = vi.fn().mockResolvedValue(undefined);
		const set = vi.fn().mockReturnValue({ where });
		const update = vi.fn().mockReturnValue({ set });

		mockGetDb.mockReturnValue({ select, update } as never);
		return { update, set, where };
	}

	describe("setYoutubeConnection", () => {
		it("persists channel id, title, encrypted token, who and a timestamp", async () => {
			const { update, set, where } = mockUpdateById("inst-1");

			await setYoutubeConnection({
				channelId: "UC1",
				channelTitle: "Wspólniak Wideo",
				encryptedRefreshToken: "enc-blob",
				connectedBy: "admin-1",
			});

			expect(update).toHaveBeenCalledWith(instanceConfig);
			expect(set).toHaveBeenCalledWith(
				expect.objectContaining({
					youtubeChannelId: "UC1",
					youtubeChannelTitle: "Wspólniak Wideo",
					youtubeRefreshToken: "enc-blob",
					youtubeConnectedBy: "admin-1",
					youtubeConnectedAt: expect.any(Date),
				}),
			);
			expect(where).toHaveBeenCalledWith(eq(instanceConfig.id, "inst-1"));
		});

		it("throws when no instance_config row exists", async () => {
			const idLimit = vi.fn().mockResolvedValue([]);
			const idFrom = vi.fn().mockReturnValue({ limit: idLimit });
			const select = vi.fn().mockReturnValue({ from: idFrom });
			mockGetDb.mockReturnValue({ select, update: vi.fn() } as never);

			await expect(
				setYoutubeConnection({
					channelId: "UC1",
					channelTitle: "T",
					encryptedRefreshToken: "enc",
					connectedBy: "admin-1",
				}),
			).rejects.toThrow(/no instance_config row/i);
		});
	});

	describe("clearYoutubeConnection", () => {
		it("nulls every youtube field", async () => {
			const { set, where } = mockUpdateById("inst-1");

			await clearYoutubeConnection();

			expect(set).toHaveBeenCalledWith({
				youtubeChannelId: null,
				youtubeChannelTitle: null,
				youtubeRefreshToken: null,
				youtubeConnectedAt: null,
				youtubeConnectedBy: null,
			});
			expect(where).toHaveBeenCalledWith(eq(instanceConfig.id, "inst-1"));
		});
	});
});

// #166 — kod dostępu /share: entropia egzekwowana w głębi modułu (setShareCode
// rzuca AppError VALIDATION/400), odczyt zwraca null gdy kod nieustawiony.
describe("share code", () => {
	/** select z jednym wierszem instance_config (limit 1). */
	function mockInstanceRow(row: Record<string, unknown>) {
		const limit = vi.fn().mockResolvedValue([row]);
		const from = vi.fn().mockReturnValue({ limit });
		const select = vi.fn().mockReturnValue({ from });
		mockGetDb.mockReturnValue({ select } as never);
		return { select, from, limit };
	}

	/** update where(eq(id)) — zwraca mocki do asercji. */
	function mockUpdateById(rowId: string) {
		const where = vi.fn();
		const set = vi.fn().mockReturnValue({ where });
		const update = vi.fn().mockReturnValue({ set });
		const limit = vi.fn().mockResolvedValue([{ id: rowId }]);
		const from = vi.fn().mockReturnValue({ limit });
		const select = vi.fn().mockReturnValue({ from });
		mockGetDb.mockReturnValue({ select, update } as never);
		return { update, set, where };
	}

	describe("getShareCode", () => {
		it("returns the stored code", async () => {
			mockInstanceRow({ shareCode: "rodzina-2026" });

			await expect(getShareCode()).resolves.toBe("rodzina-2026");
		});

		it("returns null when no code is set", async () => {
			mockInstanceRow({ shareCode: null });

			await expect(getShareCode()).resolves.toBeNull();
		});
	});

	describe("setShareCode", () => {
		it("rejects codes shorter than 4 digits (after trim)", async () => {
			await expect(setShareCode("  123  ")).rejects.toMatchObject({
				code: "VALIDATION",
				status: 400,
			});
		});

		it("rejects non-digit codes (letters)", async () => {
			await expect(setShareCode("abcd1234")).rejects.toMatchObject({
				code: "VALIDATION",
				status: 400,
			});
		});

		it("rejects codes longer than 20 digits", async () => {
			await expect(setShareCode("1".repeat(21))).rejects.toMatchObject({
				code: "VALIDATION",
				status: 400,
			});
		});

		it("saves a valid digit code trimmed into instance_config", async () => {
			const { set, where } = mockUpdateById("inst-1");

			await setShareCode("  4827  ");

			expect(set).toHaveBeenCalledWith({ shareCode: "4827" });
			expect(where).toHaveBeenCalledWith(eq(instanceConfig.id, "inst-1"));
		});

		it("throws when instance_config row is missing", async () => {
			const limit = vi.fn().mockResolvedValue([]);
			const from = vi.fn().mockReturnValue({ limit });
			const select = vi.fn().mockReturnValue({ from });
			mockGetDb.mockReturnValue({ select, update: vi.fn() } as never);

			await expect(setShareCode("4827")).rejects.toThrow(/no instance_config row/i);
		});
	});
});

// F7 #176: flaga albums — piąty master switch obok wideo/markdown/biblioteki/czatu.
describe("feature flags — albums (#176)", () => {
	beforeEach(() => invalidateFeatureFlagsCache());

	function mockSelectRow(row: Record<string, unknown>) {
		const limit = vi.fn().mockResolvedValue([row]);
		const from = vi.fn().mockReturnValue({ limit });
		const select = vi.fn().mockReturnValue({ from });
		mockGetDb.mockReturnValue({ select } as never);
	}

	it("albums defaults to enabled when the column is null (no opinion stored yet)", async () => {
		mockSelectRow({
			videoEnabled: null,
			markdownEnabled: null,
			libraryEnabled: null,
			chatEnabled: null,
			albumsEnabled: null,
		});

		const flags = await getFeatureFlags();
		expect(flags.albums).toBe(true);
	});

	it("albums is disabled when its column is false", async () => {
		mockSelectRow({
			videoEnabled: true,
			markdownEnabled: true,
			libraryEnabled: true,
			chatEnabled: true,
			albumsEnabled: false,
		});

		const flags = await getFeatureFlags();
		expect(flags.albums).toBe(false);
	});

	it("albums persists via updateFeatureFlags", async () => {
		const limit = vi.fn().mockResolvedValue([{ id: "inst-1" }]);
		const from = vi.fn().mockReturnValue({ limit });
		const select = vi.fn().mockReturnValue({ from });
		const where = vi.fn().mockResolvedValue([]);
		const set = vi.fn().mockReturnValue({ where });
		const update = vi.fn().mockReturnValue({ set });
		mockGetDb.mockReturnValue({ select, update } as never);

		await updateFeatureFlags({ albums: false });

		expect(set).toHaveBeenCalledWith({ albumsEnabled: false });
	});
});
