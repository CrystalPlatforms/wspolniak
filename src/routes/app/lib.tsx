// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, redirect } from "@tanstack/react-router";
import { BookmarksList } from "@/components/app/bookmarks-list";

export const Route = createFileRoute("/app/lib")({
	beforeLoad: ({ context }) => {
		if (!context.featureFlags.library) throw redirect({ to: "/app" });
	},
	component: BibliotekaPage,
});

function BibliotekaPage() {
	const { session } = Route.useRouteContext();

	return (
		<div className="max-w-2xl bg-background px-4 py-6 pb-28 sm:pb-6">
			<h1 className="mb-6 text-2xl font-bold text-foreground">Biblioteka</h1>
			<BookmarksList currentUserId={session.userId} currentUserRole={session.role} />
		</div>
	);
}
