// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseChatDraft } from "@/components/chat/chat-draft";
import { ChatView } from "@/components/chat/chat-view";

export const Route = createFileRoute("/app/chat")({
	// F8 #159: flaga chat OFF → guard jak Wideo/Biblioteka (redirect na feed).
	beforeLoad: ({ context }) => {
		if (!context.featureFlags.chat) throw redirect({ to: "/app" });
	},
	// Draft z URL (F5 #218, F6 #219): ?draft=post:<id> albo ?draft=text:<zakodowany
	// tekst>. Surowy string w search; sensowność (format, limity) pilnuje parseChatDraft.
	validateSearch: (search: Record<string, unknown>): { draft?: string } => ({
		draft: typeof search.draft === "string" ? search.draft : undefined,
	}),
	component: ChatPage,
});

function ChatPage() {
	const { session } = Route.useRouteContext();
	const navigate = Route.useNavigate();
	const draft = parseChatDraft(Route.useSearch().draft);

	return (
		// Mobile: kolumna kończy się NAD dolną nawigacją (~7rem jak pb-28 w innych
		// widokach) + dokładny safe-area (notch) — input i Wyślij nie chowają się pod pasek.
		// data-lock-scroll: CSS (html:has) blokuje scroll DOKUMENTU — ta strona
		// scrolluje wyłącznie listę wiadomości (pusty ogon pod treścią bywał przewijalny).
		<div
			data-lock-scroll
			className="flex h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] flex-col bg-background sm:h-dvh"
		>
			<h1 className="sr-only">Chat</h1>
			<ChatView
				currentUserId={session.userId}
				currentUserName={session.name}
				isAdmin={session.role === "admin"}
				draftPostId={draft?.type === "post" ? draft.postId : undefined}
				draftText={draft?.type === "text" ? draft.text : undefined}
				// Draft skonsumowany (anulowanie / wysyłka / post zniknął) → czyscimy
				// parametr z URL, żeby odświeżenie strony nie przywróciło podglądu.
				onDraftConsumed={() =>
					navigate({
						to: "/app/chat",
						search: (prev) => ({ ...prev, draft: undefined }),
						replace: true,
					})
				}
			/>
		</div>
	);
}
