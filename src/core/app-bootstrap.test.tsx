// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Założenia zakodowane w testach (stan na RED):
 * - Wejście: `loadAppBootstrap({ queryClient })` — helper dla beforeLoad trasy /app.
 * - Wyjście: context trasy `{ session, maintenance, featureFlags }` albo throw redirect.
 * - Dane pochodzą z server fn (RPC = granica systemu → mockowane); QueryClient prawdziwy.
 * - staleTime 60 s zgrane z serwerowym cache flag instancji.
 * - NIE testujemy tu: dehydratacji SSR, internals routera (pendingMs), PwaShell.
 */
vi.mock("@/core/functions/session", () => ({ getSession: vi.fn() }));
vi.mock("@/core/functions/maintenance", () => ({ getMaintenanceState: vi.fn() }));
vi.mock("@/core/functions/feature-flags", () => ({ getFeatureFlagsState: vi.fn() }));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { getFeatureFlagsState } from "@/core/functions/feature-flags";
import { getMaintenanceState } from "@/core/functions/maintenance";
import { getSession } from "@/core/functions/session";
import type { SessionPayload } from "@/db/identity/session";
import type { FeatureFlags, MaintenanceConfig } from "@/db/instance";
import { appBootstrapKey, loadAppBootstrap, useAppBootstrap } from "./app-bootstrap";

const mockedGetSession = vi.mocked(getSession);
const mockedGetMaintenance = vi.mocked(getMaintenanceState);
const mockedGetFlags = vi.mocked(getFeatureFlagsState);

function makeSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
	return {
		userId: "user-1",
		name: "Ania",
		role: "member",
		...overrides,
	} as SessionPayload;
}

function makeMaintenance(overrides: Partial<MaintenanceConfig> = {}): MaintenanceConfig {
	return {
		enabled: false,
		message: "",
		subtitle: "",
		icon: "",
		...overrides,
	} as MaintenanceConfig;
}

function makeFlags(overrides: Partial<FeatureFlags> = {}): FeatureFlags {
	return { video: true, markdown: true, library: true, ...overrides };
}

/** Wypełnia query cache danymi bootstrapu; `stale` cofa dataUpdatedAt poza staleTime. */
function primeCache(queryClient: QueryClient, data: unknown, stale = true) {
	queryClient.setQueryData(appBootstrapKey, data);
	if (stale) {
		queryClient
			.getQueryCache()
			.find({ queryKey: appBootstrapKey })
			?.setState({ dataUpdatedAt: Date.now() - 120_000 });
	}
}

function mockAllResolved() {
	mockedGetSession.mockResolvedValue(makeSession());
	mockedGetMaintenance.mockResolvedValue(makeMaintenance());
	mockedGetFlags.mockResolvedValue(makeFlags());
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("app bootstrap", () => {
	describe("loadAppBootstrap", () => {
		it("pobiera sesję, maintenance i flagi przy pustym cache i zwraca context trasy", async () => {
			mockAllResolved();
			const queryClient = new QueryClient();

			const context = await loadAppBootstrap({ queryClient });

			expect(context.session.userId).toBe("user-1");
			expect(context.maintenance.enabled).toBe(false);
			expect(context.featureFlags.video).toBe(true);
			expect(mockedGetSession).toHaveBeenCalledTimes(1);
			expect(mockedGetMaintenance).toHaveBeenCalledTimes(1);
			expect(mockedGetFlags).toHaveBeenCalledTimes(1);
		});

		it("redirectuje na / gdy sesji brak (auth safety)", async () => {
			mockedGetSession.mockResolvedValue(null);
			mockedGetMaintenance.mockResolvedValue(makeMaintenance());
			mockedGetFlags.mockResolvedValue(makeFlags());
			const queryClient = new QueryClient();

			const error: unknown = await loadAppBootstrap({ queryClient }).catch(
				(thrown: unknown) => thrown,
			);

			expect(isRedirect(error)).toBe(true);
			expect((error as { options?: { to?: string } }).options?.to).toBe("/");
		});

		it("zwraca dane z cache bez czekania na sieć — wiszący request nie blokuje nawigacji", async () => {
			const queryClient = new QueryClient();
			primeCache(queryClient, {
				session: makeSession({ name: "Staszek" }),
				maintenance: makeMaintenance({ message: "stara" }),
				featureFlags: makeFlags({ video: false }),
			});
			// Sieć "wisi" — jeśli loadAppBootstrap by na niej czekał, test by timeoutował.
			mockedGetSession.mockReturnValue(new Promise(() => {}));
			mockedGetMaintenance.mockReturnValue(new Promise(() => {}));
			mockedGetFlags.mockReturnValue(new Promise(() => {}));

			const context = await loadAppBootstrap({ queryClient });

			expect(context.session.name).toBe("Staszek");
			expect(context.maintenance.message).toBe("stara");
			expect(context.featureFlags.video).toBe(false);
		});

		it("świeży przeterminowane dane w tle — cache dostaje nowe wartości po resolve", async () => {
			const queryClient = new QueryClient();
			primeCache(queryClient, {
				session: makeSession({ name: "Staszek" }),
				maintenance: makeMaintenance(),
				featureFlags: makeFlags({ video: false }),
			});
			mockedGetSession.mockResolvedValue(makeSession({ name: "Nowa Ania" }));
			mockedGetMaintenance.mockResolvedValue(makeMaintenance());
			mockedGetFlags.mockResolvedValue(makeFlags({ video: true }));

			const context = await loadAppBootstrap({ queryClient });
			// Natychmiast: stare wartości (bez flasha pendingu).
			expect(context.session.name).toBe("Staszek");
			expect(context.featureFlags.video).toBe(false);

			// W tle revalidation podmienia dane w cache.
			await waitFor(() =>
				expect(queryClient.getQueryData(appBootstrapKey)).toMatchObject({
					session: { name: "Nowa Ania" },
					featureFlags: { video: true },
				}),
			);
		});
	});

	describe("useAppBootstrap", () => {
		function createWrapper(queryClient: QueryClient) {
			return function Wrapper({ children }: { children: ReactNode }) {
				return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
			};
		}

		it("cold: pusty cache → isPending, brak wartości", () => {
			mockedGetSession.mockReturnValue(new Promise(() => {}));
			mockedGetMaintenance.mockReturnValue(new Promise(() => {}));
			mockedGetFlags.mockReturnValue(new Promise(() => {}));
			const queryClient = new QueryClient();

			const { result } = renderHook(() => useAppBootstrap(), {
				wrapper: createWrapper(queryClient),
			});

			expect(result.current.isPending).toBe(true);
			expect(result.current.session).toBeUndefined();
			expect(result.current.featureFlags).toBeUndefined();
		});

		it("warm: stare dane od razu bez pendingu, refetch w tle podmienia wartości", async () => {
			const queryClient = new QueryClient();
			primeCache(queryClient, {
				session: makeSession({ name: "Staszek" }),
				maintenance: makeMaintenance(),
				featureFlags: makeFlags({ video: false }),
			});
			mockedGetSession.mockResolvedValue(makeSession({ name: "Nowa Ania" }));
			mockedGetMaintenance.mockResolvedValue(makeMaintenance());
			mockedGetFlags.mockResolvedValue(makeFlags({ video: true }));

			const { result } = renderHook(() => useAppBootstrap(), {
				wrapper: createWrapper(queryClient),
			});

			// Natychmiast stare wartości — isPending nie rośnie (brak flasha).
			expect(result.current.isPending).toBe(false);
			expect(result.current.session?.name).toBe("Staszek");
			expect(result.current.featureFlags?.video).toBe(false);

			// Background refetch podmienia dane na żywo.
			await waitFor(() => expect(result.current.session?.name).toBe("Nowa Ania"));
			expect(result.current.isPending).toBe(false);
			expect(result.current.featureFlags?.video).toBe(true);
		});
	});
});
