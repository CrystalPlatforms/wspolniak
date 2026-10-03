// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { DocsLanding } from "@/components/docs/docs-landing";
import { LandingPage } from "@/components/landing/landing-page";
import { getSession } from "@/core/functions/session";
import { isDocsHostname } from "@/docs/host";

/**
 * Host-aware root (F1 #204): SSR czyta Host z requestu, klient z window.location.
 * createIsomorphicFn (a nie ręczny typeof-window guard) — bo plik trasy jest też
 * w bundlu klienta, a `@tanstack/react-start/server` jest tam blokowany przez
 * import protection. Wariant .server jest wycinany z builda przeglądarki.
 */
const getHostname = createIsomorphicFn()
	.server(() => new URL(getRequest().url).hostname)
	.client(() => window.location.hostname);

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		// Na hostach docs.* landing docsów bez sesji (docsy są w pełni publiczne);
		// na app hostach dzisiejszy landing apki z redirectem zalogowanych do /app.
		if (isDocsHostname(getHostname())) {
			return { isDocsHost: true };
		}

		const session = await getSession();
		if (session) {
			throw redirect({ to: "/app" });
		}
		return { isDocsHost: false };
	},
	component: function IndexPage() {
		const { isDocsHost } = Route.useRouteContext();
		return isDocsHost ? <DocsLanding /> : <LandingPage isAuthenticated={false} />;
	},
});
