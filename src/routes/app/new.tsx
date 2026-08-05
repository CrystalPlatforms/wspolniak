// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { NewPostForm } from "@/components/app/new-post-form";
import { usePublishPost } from "@/components/app/use-publish-post";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/app/new")({
	component: NewPostPage,
});

function NewPostPage() {
	const navigate = useNavigate();
	const { featureFlags } = Route.useRouteContext();
	const { publish, isPending, isError, error, reset } = usePublishPost();

	return (
		<div className="max-w-2xl bg-background px-4 py-6 pb-50 sm:pb-6">
			<div className="mb-6 flex items-center gap-4">
				<button
					type="button"
					onClick={() => navigate({ to: "/app" })}
					className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
					title="Wróć do feeda"
				>
					<ArrowLeft className="h-5 w-5" />
				</button>
				<h1 className="text-2xl font-bold text-foreground">Nowy post</h1>
			</div>

			{isError && error ? (
				<Alert variant="destructive" className="mb-4">
					<AlertDescription>{error.message}</AlertDescription>
				</Alert>
			) : null}

			<NewPostForm
				featureFlags={featureFlags}
				onSubmit={async (data) => {
					// Blokujący flow: zostajemy na formie do sukcesu. navigate + invalidate
					// odpalają się w onSuccess hooka; błąd ląduje w `error` (Alert nad formą).
					reset();
					try {
						await publish({
							description: data.description || null,
							files: data.files,
							videoIds: data.videoIds,
							mentions: data.mentions,
						});
					} catch {
						// obsłużone przez isError/error — tekst i zdjęcia zostają w formie
					}
				}}
				isSubmitting={isPending}
			/>
		</div>
	);
}
