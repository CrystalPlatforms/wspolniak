// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute } from "@tanstack/react-router";
import { ChatView } from "@/components/chat/chat-view";

export const Route = createFileRoute("/app/chat")({
	component: ChatPage,
});

function ChatPage() {
	const { session } = Route.useRouteContext();

	return (
		// Mobile: kolumna kończy się NAD dolną nawigacją (~7rem jak pb-28 w innych
		// widokach) + dokładny safe-area (notch) — input i Wyślij nie chowają się pod pasek.
		<div className="flex h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] flex-col bg-background sm:h-dvh">
			<h1 className="sr-only">Czat</h1>
			<ChatView currentUserId={session.userId} currentUserName={session.name} />
		</div>
	);
}
