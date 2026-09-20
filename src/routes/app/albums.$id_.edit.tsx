// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AlbumEditForm } from "@/components/app/album-edit-form";

export const Route = createFileRoute("/app/albums/$id_/edit")({
	component: AlbumEditPage,
});

/**
 * Reviza #187: ekran „Edytuj album" — tytuł (PATCH) + usuwanie albumu
 * (DELETE z dialogiem potwierdzenia). Po zapisie wracamy do widoku albumu,
 * po usunięciu — do listy albumów.
 */
function AlbumEditPage() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	return (
		<div className="max-w-2xl bg-background px-4 py-6 pb-28 sm:pb-6">
			<AlbumEditForm
				albumId={id}
				onSaved={(_title) => {
					queryClient.invalidateQueries({ queryKey: ["albums"] });
					navigate({ to: "/app/albums/$id", params: { id } });
				}}
				onDeleted={() => {
					queryClient.invalidateQueries({ queryKey: ["albums"] });
					navigate({ to: "/app/albums" });
				}}
				backButton={
					<Link
						to="/app/albums/$id"
						params={{ id }}
						className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
						title="Wróć do albumu"
					>
						<ArrowLeft className="h-5 w-5" />
					</Link>
				}
			/>
		</div>
	);
}
