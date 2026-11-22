// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Stare linki do czatu (#245): trasa /app/chat istnieje WYŁĄCZNIE jako redirect
 * na feed — stare zakładki i pushe nie wpadają w 404. Test importuje definicję
 * Route (plik trasy jest z definicji nie-testowalny bez routera) i odpala
 * beforeLoad bezpośrednio, tak jak robi to router przy wejściu w trasę.
 * `Route.options` — publiczne API TanStack Router z konfiguracją trasy.
 */
import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { Route } from "@/routes/app/chat";

describe("stare URL-e czatu → redirect na feed (#245)", () => {
	it("beforeLoad trasy /app/chat rzuca redirect na /app", async () => {
		const { beforeLoad } = Route.options;

		const thrown = await Promise.resolve()
			.then(() =>
				beforeLoad?.({
					context: { session: { userId: "u1", name: "Ania", role: "member" } },
					location: { pathname: "/app/chat" },
					params: {},
					search: {},
					cause: undefined,
				} as never),
			)
			.catch((error: unknown) => error);

		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { options?: { to?: string } }).options?.to).toBe("/app");
	});
});
