// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (Video v2 F1 #194, us story 25): stare adresy biblioteki
// (`/app/video`, `/app/video/$id`, `/app/new-video`) robią redirect na `/app`
// w beforeLoad trasy. Test importuje moduły tras (definicje, nie router) i
// asertuje rzucony redirect (Response z options.to); routes/** są poza
// discovery vitest, więc ten test żyje obok komponentów.

interface RedirectResponse extends Response {
	options: { to: string };
}

interface RouteModuleLike {
	Route: {
		options: {
			beforeLoad?: () => Promise<unknown>;
		};
	};
}

async function thrownRedirect(
	importer: () => Promise<unknown>,
): Promise<RedirectResponse | undefined> {
	try {
		const mod = (await importer()) as RouteModuleLike;
		await mod.Route.options.beforeLoad?.();
		return undefined;
	} catch (e) {
		return e as RedirectResponse;
	}
}

describe("Video v2 (#194) — stare adresy biblioteki redirectują na feed", () => {
	it("/app/video redirects to /app", async () => {
		const redirect = await thrownRedirect(() => import("@/routes/app/video"));

		expect(redirect?.options?.to).toBe("/app");
	});

	it("/app/video/$id redirects to /app", async () => {
		const redirect = await thrownRedirect(() => import("@/routes/app/video.$id"));

		expect(redirect?.options?.to).toBe("/app");
	});

	it("/app/new-video redirects to /app", async () => {
		const redirect = await thrownRedirect(() => import("@/routes/app/new-video"));

		expect(redirect?.options?.to).toBe("/app");
	});
});
