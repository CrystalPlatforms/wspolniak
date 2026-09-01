// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, LogOut } from "lucide-react";
import { useState } from "react";
import { ChatSettingsNote } from "@/components/app/chat-settings-note";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

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
	const queryClient = useQueryClient();

	// AL (F1 #179) — stan dostępu do AI zalogowanego usera + zapis opt-in.
	const aiAccessQuery = useQuery({
		queryKey: ["ai", "access"],
		queryFn: async () => {
			const res = await fetch("/api/ai/access");
			if (!res.ok) throw new Error("Nie udało się pobrać ustawień AL");
			const json = (await res.json()) as {
				data: { master: boolean; aiOptIn: boolean; aiBlocked: boolean; effective: boolean };
			};
			return json.data;
		},
	});

	const aiOptInMutation = useMutation({
		mutationFn: async (optIn: boolean) => {
			const res = await fetch("/api/ai/opt-in", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ optIn }),
			});
			if (!res.ok) {
				const err = (await res.json()) as { error: string };
				throw new Error(err.error);
			}
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["ai", "access"] });
		},
	});

	const aiBlocked = aiAccessQuery.data?.aiBlocked ?? false;
	const aiOptIn = aiAccessQuery.data?.aiOptIn ?? false;

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
				<h2 className="mb-3 text-lg font-semibold text-foreground">AL</h2>
				<div className="flex items-center justify-between gap-4">
					<span className="flex flex-col">
						<span className="font-medium text-foreground">AL (asystent AI)</span>
						<span className="text-sm text-muted-foreground">
							{aiBlocked
								? "AL został dla Ciebie wyłączony przez administratora."
								: "Włącz AL, aby móc rozmawiać z asystentem AI w aplikacji."}
						</span>
					</span>
					<Switch
						checked={aiOptIn}
						disabled={aiBlocked || aiAccessQuery.isPending || aiOptInMutation.isPending}
						onCheckedChange={(v) => {
							aiOptInMutation.reset();
							aiOptInMutation.mutate(v);
						}}
						aria-label="AL (asystent AI)"
					/>
				</div>
			</section>

			{session.role === "admin" && (
				<section className="rounded-lg border border-border bg-card p-4">
					<h2 className="mb-3 text-lg font-semibold text-foreground">Zarządzanie</h2>
					<Link
						to="/app/admin"
						className="flex items-center justify-between gap-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						Panel administratora
						<ChevronRight className="h-4 w-4" />
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
						<LogOut className="h-4 w-4" />
						Wyloguj się
					</Button>
				</div>
			</section>
		</div>
	);
}
