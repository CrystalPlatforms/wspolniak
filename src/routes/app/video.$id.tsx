// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Video v2 (#194): strona pojedynczego wideo z biblioteki została usunięta —
 * stary adres `/app/video/$id` prowadzi teraz do feedu.
 */
export const Route = createFileRoute("/app/video/$id")({
	beforeLoad: () => {
		throw redirect({ to: "/app" });
	},
});
