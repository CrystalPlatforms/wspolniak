// SPDX-License-Identifier: AGPL-3.0-or-later
import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Cog } from "lucide-react";
import { Feed } from "@/components/app/feed";
import { type FeedPage, feedQueryKey } from "@/components/app/feed-query";
import { PullToRefresh } from "@/components/app/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { getFeedPage } from "@/core/functions/feed";

type FeedCursor = NonNullable<FeedPage["meta"]["nextCursor"]>;

/**
 * Wspólne opcje infinite query feedu — używane przez SSR loader (preload pierwszej strony)
 * oraz przez komponent (odczyt z cache + fetchNextPage). Serwer fn getFeedPage woła
 * assembleFeedPage server-side; na kliencie RPC-uje. Wynik ma daty zserializowane do ISO (string).
 */
export const feedOptions = infiniteQueryOptions({
	queryKey: feedQueryKey,
	queryFn: ({ pageParam }: { pageParam: FeedCursor | undefined }) =>
		getFeedPage({ data: { cursor: pageParam } }).then((page) => page as unknown as FeedPage),
	initialPageParam: undefined as FeedCursor | undefined,
	getNextPageParam: (lastPage: FeedPage) => lastPage.meta.nextCursor ?? undefined,
});

export const Route = createFileRoute("/app/")({
	// SSR preload: pierwsza strona feedu trafia do cache przed renderem HTML,
	// eliminując czarny ekran i podwójny loader (dane przychodzą razem z HTML).
	loader: async ({ context }) => {
		await context.queryClient.ensureInfiniteQueryData(feedOptions);
	},
	component: FeedScreen,
});

function FeedScreen() {
	const { session, featureFlags } = Route.useRouteContext();
	const { data, hasNextPage, isFetchingNextPage, fetchNextPage, refetch, isPending } =
		useInfiniteQuery(feedOptions);

	const allPosts = data?.pages.flatMap((page) => page.data) ?? [];
	const imageAccountHash = data?.pages[0]?.meta.imageAccountHash ?? "";

	return (
		<PullToRefresh
			onRefresh={async () => {
				await refetch();
			}}
		>
			<div className="max-w-2xl bg-background px-4 py-6 pb-28 sm:pb-6">
				{/* Header 1:1 jak Kalendarz/Albumy: tytuł + flex-1 + ghost ikona.
				    Ustawienia przeniesione tu z menu (reviza usera) — po przeciwnej
				    stronie „Witaj", na tej samej wysokości. */}
				<div className="mb-6 flex items-center gap-2">
					<h1 className="text-2xl font-bold text-foreground">Witaj {session.name}</h1>
					<div className="flex-1" />
					<Link to="/app/settings">
						<Button variant="ghost" size="lg" title="Ustawienia">
							<Cog className="size-6" />
						</Button>
					</Link>
				</div>
				<Feed
					posts={allPosts as never[]}
					imageAccountHash={imageAccountHash}
					currentUserId={session.userId}
					currentUserRole={session.role}
					libraryEnabled={featureFlags.library}
					hasNextPage={hasNextPage}
					isFetchingNextPage={isFetchingNextPage}
					onLoadMore={() => fetchNextPage()}
					isPending={isPending}
				/>
			</div>
		</PullToRefresh>
	);
}
