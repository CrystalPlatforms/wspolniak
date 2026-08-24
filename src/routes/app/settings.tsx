// SPDX-License-Identifier: AGPL-3.0-or-later

import { createFileRoute } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { ChatSettingsNote } from "@/components/app/chat-settings-note";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";

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
	const { featureFlags } = Route.useRouteContext();
	const [loggingOut, setLoggingOut] = useState(false);

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
						<LogOut className="h-4 w-4" />
						Wyloguj się
					</Button>
				</div>
			</section>
		</div>
	);
}
