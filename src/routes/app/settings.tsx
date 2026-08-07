// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	return (
		<div className="bg-background px-4 py-6 pb-28 sm:pb-6">
			<h1 className="mb-6 text-2xl font-bold text-foreground">Ustawienia</h1>

			<div className="flex min-h-[50vh] items-center justify-center">
				<p className="text-center text-muted-foreground">
					Ustawienia mogą być dostępne w przyszłej wersji.
				</p>
			</div>
		</div>
	);
}
