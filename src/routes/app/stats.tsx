// SPDX-License-Identifier: AGPL-3.0-or-later

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeaderboardCategory, LeaderboardEntry, StatsSummary } from "@/db/stats";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/stats")({
	component: StatsPage,
});

const LEADERBOARD_TITLES: Record<LeaderboardCategory, string> = {
	posts: "Posty",
	comments: "Komentarze",
	photos: "Zdjęcia",
	reactions: "Reakcje",
	"mentions-received": "Wzmianki (otrzymane)",
	"mentions-made": "Wzmianki (nadane)",
};

const LEADERBOARD_ORDER: LeaderboardCategory[] = [
	"posts",
	"comments",
	"photos",
	"reactions",
	"mentions-received",
	"mentions-made",
];

type Leaderboards = Record<LeaderboardCategory, LeaderboardEntry[]>;

function StatsPage() {
	const { session } = Route.useRouteContext();
	const isAdmin = session.role === "admin";

	const leaderboardsQuery = useQuery({
		queryKey: ["stats", "leaderboard"],
		queryFn: async (): Promise<Leaderboards> => {
			const res = await fetch("/api/app/stats/leaderboard?limit=3");
			if (!res.ok) throw new Error("Nie udało się pobrać rankingów");
			const json = (await res.json()) as { data: Leaderboards };
			return json.data;
		},
	});

	// Sekcja admina (DAU/WAU/zdjęcia/push/łącznie) — tylko dla admina.
	const adminStatsQuery = useQuery({
		queryKey: ["admin", "stats"],
		enabled: isAdmin,
		queryFn: async (): Promise<StatsSummary> => {
			const res = await fetch("/api/admin/stats");
			if (!res.ok) throw new Error("Nie udało się pobrać statystyk");
			const json = (await res.json()) as { data: StatsSummary };
			return json.data;
		},
	});

	return (
		<div className="bg-background px-4 py-6 pb-28 sm:pb-6">
			<h1 className="mb-6 text-2xl font-bold text-foreground">Statystyki</h1>

			<section className="mb-10">
				<h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Ranking rodziny
				</h3>

				{leaderboardsQuery.isLoading && (
					<div className="space-y-3" aria-busy="true">
						{[0, 1, 2, 3].map((i) => (
							<div key={i} className="flex items-center gap-3">
								<Skeleton className="size-8 rounded-full" />
								<Skeleton className="h-3 flex-1" />
								<Skeleton className="h-3 w-10" />
							</div>
						))}
					</div>
				)}
				{leaderboardsQuery.isError && (
					<p className="text-sm text-destructive">{leaderboardsQuery.error.message}</p>
				)}

				{leaderboardsQuery.data && (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{LEADERBOARD_ORDER.map((category) => (
							<LeaderboardCard
								key={category}
								title={LEADERBOARD_TITLES[category]}
								entries={leaderboardsQuery.data[category] ?? []}
							/>
						))}
					</div>
				)}
			</section>

			{isAdmin && <AdminSection query={adminStatsQuery} />}
		</div>
	);
}

function LeaderboardCard({ title, entries }: { title: string; entries: LeaderboardEntry[] }) {
	return (
		<div className="rounded-lg border border-border bg-card p-4">
			<h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
			{entries.length === 0 ? (
				<p className="text-xs text-muted-foreground">Jeszcze nic.</p>
			) : (
				<ol className="space-y-2">
					{entries.map((entry, i) => {
						const medal = medalColor(i);
						return (
							<li key={entry.name} className="flex items-center justify-between gap-2 text-sm">
								<span className="flex items-center gap-2">
									<span
										className={cn(
											"w-5 text-right text-xs font-bold",
											medal ?? "text-muted-foreground",
										)}
									>
										{i + 1}
									</span>
									<span className={medal ?? "text-foreground"}>{entry.name}</span>
								</span>
								<span className="font-bold text-foreground">{entry.count}</span>
							</li>
						);
					})}
				</ol>
			)}
		</div>
	);
}

// Medalowe kolory dla miejsc 1–3 (złoto / srebro / brąz) — dla liczby i imienia.
// Reszta miejsc bez koloru medalowego (liczba muted, imię foreground).
function medalColor(index: number): string | undefined {
	if (index === 0) return "text-yellow-600 dark:text-yellow-400"; // złoto
	if (index === 1) return "text-[#878787]"; // srebro
	if (index === 2) return "text-[#543508] dark:text-[#b07d2e]"; // brąz
	return undefined;
}

function AdminSection({ query }: { query: ReturnType<typeof useQuery<StatsSummary>> }) {
	return (
		<section>
			{query.isLoading && (
				<div className="grid grid-cols-2 gap-3" aria-busy="true">
					<Skeleton className="h-20 rounded-lg" />
					<Skeleton className="h-20 rounded-lg" />
					<Skeleton className="h-20 rounded-lg" />
					<Skeleton className="h-20 rounded-lg" />
				</div>
			)}
			{query.isError && <p className="text-sm text-destructive">{query.error.message}</p>}

			{query.data && (
				<>
					<h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Aktywność
					</h3>
					<div className="mb-8 grid grid-cols-2 gap-3">
						<StatCard label="Aktywni dzisiaj (24h)" value={String(query.data.dau)} />
						<StatCard label="Aktywni w tygodniu (7d)" value={String(query.data.wau)} />
						<StatCard label="Zdjęcia (7d)" value={String(query.data.photosLast7Days)} />
						<PushCard
							attempts={query.data.pushDeliveryLast7Days.attempts}
							successes={query.data.pushDeliveryLast7Days.successes}
							rate={query.data.pushDeliveryLast7Days.rate}
						/>
					</div>

					<h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Łącznie we Wspólniaku
					</h3>
					<div className="grid grid-cols-2 gap-3">
						<StatCard label="Posty" value={String(query.data.totalPosts)} accent />
						<StatCard label="Komentarze" value={String(query.data.totalComments)} accent />
						<StatCard label="Zdjęcia" value={String(query.data.totalPhotos)} accent />
						<StatCard label="Reakcje" value={String(query.data.totalReactions)} accent />
						<StatCard label="Mentions" value={String(query.data.totalMentions)} accent />
					</div>
				</>
			)}
		</section>
	);
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
	return (
		<div
			className={`rounded-lg border bg-card p-4 ${
				accent ? "border-2 border-[#167c51]" : "border-border"
			}`}
		>
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
		</div>
	);
}

function PushCard({
	attempts,
	successes,
	rate,
}: {
	attempts: number;
	successes: number;
	rate: number;
}) {
	return (
		<div className="rounded-lg border border-border bg-card p-4">
			<p className="text-xs text-muted-foreground">Powiadomienia dostarczone (7d)</p>
			<p className="mt-1 text-2xl font-bold text-foreground">{Math.round(rate * 100)}%</p>
			<p className="mt-1 text-xs text-muted-foreground">
				{successes} / {attempts} prób
			</p>
		</div>
	);
}
