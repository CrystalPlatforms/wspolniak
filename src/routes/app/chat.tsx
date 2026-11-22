// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Czat usunięty (#245): stare URL-e `/app/chat` (zakładki, stare pushe) kierują
 * na feed zamiast 404. Redirect w beforeLoad działa i po stronie SSR (HTTP 30x),
 * i po stronie klienta (routerowe przejście).
 */
export const Route = createFileRoute("/app/chat")({
	beforeLoad: () => {
		throw redirect({ to: "/app" });
	},
});
