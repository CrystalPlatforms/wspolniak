// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { calendarProposalTemplate } from "@/components/app/calendar-proposal";
import { NewPostForm } from "@/components/app/new-post-form";
import { UploadErrorAlert } from "@/components/app/upload-error-alert";
import {
	type PublishPostInput,
	usePublishPost,
	VideoNotConnectedError,
} from "@/components/app/use-publish-post";

/** ?calendar=1 — wejście z przycisku „Zaproponuj datę" (Kalendarz v2, #163). */
interface NewPostSearch {
	calendar?: boolean;
}

export const Route = createFileRoute("/app/new")({
	validateSearch: (search: Record<string, unknown>): NewPostSearch => ({
		calendar: search.calendar === true || search.calendar === "1",
	}),
	component: NewPostPage,
});

function NewPostPage() {
	const { featureFlags, session } = Route.useRouteContext();
	const { calendar } = Route.useSearch();
	const { publish, isPending, uploadProgress, isSlowUpload, isError, error, reset } =
		usePublishPost();
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
			{/* Reviza #187: nagłówek (strzałka + tytuł + przyciski AL) rysuje NewPostForm. */}
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
				initialDescription={calendar ? calendarProposalTemplate(session.name) : undefined}
				onSubmit={(data) =>
					handlePublish({
						description: data.description || null,
						files: data.files,
						pendingVideos: data.pendingVideos,
						mentions: data.mentions,
					})
				}
				isSubmitting={isPending}
				uploadProgress={uploadProgress}
				isSlowUpload={isSlowUpload}
				videoNotConnected={error instanceof VideoNotConnectedError}
			/>
		</div>
	);
}
