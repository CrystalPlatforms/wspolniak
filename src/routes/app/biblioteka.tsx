// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute } from "@tanstack/react-router";
import { BookmarksList } from "@/components/app/bookmarks-list";

export const Route = createFileRoute("/app/biblioteka")({
	component: BibliotekaPage,
});

function BibliotekaPage() {
	return (
		<div className="max-w-2xl bg-background px-4 py-6 pb-28 sm:pb-6">
			<h1 className="mb-6 text-2xl font-bold text-foreground">Biblioteka</h1>
			<BookmarksList />
		</div>
	);
}
