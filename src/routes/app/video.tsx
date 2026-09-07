// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Video v2 (#194): biblioteka wideo została usunięta — stary adres `/app/video`
 * (bookmark, historia) prowadzi teraz do feedu.
 */
export const Route = createFileRoute("/app/video")({
	beforeLoad: () => {
		throw redirect({ to: "/app" });
	},
});
