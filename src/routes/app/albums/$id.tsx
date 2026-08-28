// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AlbumView } from "@/components/app/album-view";

export const Route = createFileRoute("/app/albums/$id")({
	component: AlbumDetailPage,
});

function AlbumDetailPage() {
	const { id } = Route.useParams();
	const { session } = Route.useRouteContext();

	return (
		<div className="max-w-2xl bg-background px-4 py-6 pb-28 sm:pb-6">
			<div className="mb-6 flex items-center gap-4">
				<Link
					to="/app/albums"
					className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
					title="Wróć do albumów"
				>
					<ArrowLeft className="h-5 w-5" />
				</Link>
			</div>
			<AlbumView albumId={id} currentUserId={session.userId} currentUserRole={session.role} />
		</div>
	);
}
