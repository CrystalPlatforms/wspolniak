// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Video v2 (#194): osobny formularz uploadu wideo został usunięty — wideo
 * dodaje się teraz w kompozytorze postów. Stary adres prowadzi do feedu.
 */
export const Route = createFileRoute("/app/new-video")({
	beforeLoad: () => {
		throw redirect({ to: "/app" });
	},
});
