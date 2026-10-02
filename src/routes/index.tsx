// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, redirect } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { DocsLanding } from "@/components/docs/docs-landing";
import { LandingPage } from "@/components/landing/landing-page";
import { getSession } from "@/core/functions/session";
import { isDocsHostname } from "@/docs/host";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		// Host-aware root (F1 #204): na hostach docs.* landing docsów bez sesji (docsy
		// są w pełni publiczne); na app hostach dzisiejszy landing apki z redirectem
		// zalogowanych do /app. SSR czyta Host z requestu, klient z window.location.
		const hostname =
			typeof window !== "undefined" ? window.location.hostname : new URL(getRequest().url).hostname;
		if (isDocsHostname(hostname)) {
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
