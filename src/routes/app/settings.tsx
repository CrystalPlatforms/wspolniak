// SPDX-License-Identifier: AGPL-3.0-or-later

import { IconChevronRight, IconLogout } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChatSettingsNote } from "@/components/app/chat-settings-note";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { useDocsHref } from "@/docs/use-cross-host-href";

export const Route = createFileRoute("/app/settings")({
	component: SettingsPage,
});

/** Wylogowanie: kasuje httpOnly cookie sesyjne na serwerze, potem pełne
 *  przeładowanie na landing (czyści też cache w pamięci). */
async function logout(): Promise<void> {
	await fetch("/api/auth/logout", { method: "POST" });
	window.location.href = "/";
}

function SettingsPage() {
	// F8 #159: notka o 24h tylko, gdy czat włączony (flaga z kontekstu /app).
	// Rola z sesji steruje widocznością sekcji „Zarządzanie" (przebudowa 2026-09-01).
	const { featureFlags, session } = Route.useRouteContext();
	const [loggingOut, setLoggingOut] = useState(false);
	// Dokumentacja żyje na subdomenie docs.* — pełny URL liczymy z originu karty
	// (po mount, bez hydration mismatch); dev: docs.localhost:3000, prod: docs.wspolniak.com.
	const docsHref = useDocsHref("/");

	return (
		<div className="max-w-2xl space-y-6 bg-background px-4 py-6 pb-28 sm:pb-6">
			<h1 className="text-2xl font-bold text-foreground">Ustawienia</h1>

			{featureFlags.chat && <ChatSettingsNote />}

			<section className="rounded-lg border border-border bg-card p-4">
				<h2 className="mb-3 text-lg font-semibold text-foreground">Wygląd</h2>
				<div className="flex items-center justify-between gap-4">
					<p className="text-sm text-muted-foreground">Motyw aplikacji</p>
					<ThemeToggle variant="outline" showLabel />
				</div>
			</section>

			<section className="rounded-lg border border-border bg-card p-4">
				<h2 className="mb-3 text-lg font-semibold text-foreground">Dokumentacja</h2>
				<a
					href={docsHref}
					className="flex items-center justify-between gap-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					Dokumentacja Wspólniaka
					<IconChevronRight className="h-4 w-4" aria-hidden="true" />
				</a>
			</section>

			{session.role === "admin" && (
				<section className="rounded-lg border border-border bg-card p-4">
					<h2 className="mb-3 text-lg font-semibold text-foreground">Zarządzanie</h2>
					<Link
						to="/app/admin"
						className="flex items-center justify-between gap-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						Panel administratora
						<IconChevronRight className="h-4 w-4" aria-hidden="true" />
					</Link>
				</section>
			)}

			<section className="rounded-lg border border-border bg-card p-4">
				<h2 className="mb-3 text-lg font-semibold text-foreground">Konto</h2>
				<div className="flex items-center justify-between gap-4">
					<p className="text-sm text-muted-foreground">Zakończ sesję na tym urządzeniu</p>
					<Button
						variant="outline"
						disabled={loggingOut}
						onClick={() => {
							setLoggingOut(true);
							logout().catch(() => setLoggingOut(false));
						}}
						className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
					>
						<IconLogout className="h-4 w-4" aria-hidden="true" />
						Wyloguj się
					</Button>
				</div>
			</section>
		</div>
	);
}
