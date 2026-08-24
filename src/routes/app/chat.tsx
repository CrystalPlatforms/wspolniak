// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChatView } from "@/components/chat/chat-view";

export const Route = createFileRoute("/app/chat")({
	// F8 #159: flaga chat OFF → guard jak Wideo/Biblioteka (redirect na feed).
	beforeLoad: ({ context }) => {
		if (!context.featureFlags.chat) throw redirect({ to: "/app" });
	},
	component: ChatPage,
});

function ChatPage() {
	const { session } = Route.useRouteContext();

	return (
		// Mobile: kolumna kończy się NAD dolną nawigacją (~7rem jak pb-28 w innych
		// widokach) + dokładny safe-area (notch) — input i Wyślij nie chowają się pod pasek.
		<div className="flex h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] flex-col bg-background sm:h-dvh">
			<h1 className="sr-only">Chat</h1>
			<ChatView
				currentUserId={session.userId}
				currentUserName={session.name}
				isAdmin={session.role === "admin"}
			/>
		</div>
	);
}
