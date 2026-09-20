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
			{/* Reviza #187: strzałka trafia do nagłówka AlbumView — tytuł albumu
			    stoi w JEDNEJ linii z przyciskiem wstecz (i akcjami nagłówka). */}
			<AlbumView
				albumId={id}
				currentUserId={session.userId}
				currentUserRole={session.role}
				backButton={
					<Link
						to="/app/albums"
						className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
						title="Wróć do albumów"
					>
						<ArrowLeft className="h-5 w-5" />
					</Link>
				}
			/>
		</div>
	);
}
