// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useRef } from "react";
import { NewPostForm } from "@/components/app/new-post-form";
import { UploadErrorAlert } from "@/components/app/upload-error-alert";
import { type PublishPostInput, usePublishPost } from "@/components/app/use-publish-post";

export const Route = createFileRoute("/app/new")({
	component: NewPostPage,
});

function NewPostPage() {
	const navigate = useNavigate();
	const { featureFlags } = Route.useRouteContext();
	const { publish, isPending, isError, error, reset } = usePublishPost();
	// Ostatni input trzymany do ręcznego ponowienia (issue #135) — forma po błędzie
	// trzyma stan, ale retry z Alertu musi mieć dane, którymi wołamy publish.
	const lastInputRef = useRef<PublishPostInput | null>(null);

	const handlePublish = async (input: PublishPostInput) => {
		lastInputRef.current = input;
		// Blokujący flow: zostajemy na formie do sukcesu. navigate + invalidate
		// odpalają się w onSuccess hooka; błąd ląduje w `error` (Alert nad formą).
		reset();
		try {
			await publish(input);
		} catch {
			// obsłużone przez isError/error — tekst i zdjęcia zostają w formie
		}
	};

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

			<UploadErrorAlert
				error={isError ? error : null}
				onRetry={async () => {
					const input = lastInputRef.current;
					if (input) await handlePublish(input);
				}}
				retryDisabled={isPending}
			/>

			<NewPostForm
				featureFlags={featureFlags}
				onSubmit={(data) =>
					handlePublish({
						description: data.description || null,
						files: data.files,
						videoIds: data.videoIds,
						mentions: data.mentions,
					})
				}
				isSubmitting={isPending}
			/>
		</div>
	);
}
