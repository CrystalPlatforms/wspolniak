// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

/**
 * Layout trasy `/app/video` — renderuje wyłącznie `<Outlet>` dla dzieci:
 * feedu (`video/index.tsx`) oraz strony szczegółów (`video.$id.tsx`).
 *
 * Kiedyś był tu komponent feedu, ale ponieważ `video.$id` jest dzieckiem tej
 * trasy, brak `<Outlet>` powodował, że klik w kartę zmieniał URL, ale detail
 * się nie renderował (widok zostawał na feedzie). Stąd ten cienki layout.
 */
export const Route = createFileRoute("/app/video")({
	beforeLoad: ({ context }) => {
		if (!context.featureFlags.video) throw redirect({ to: "/app" });
	},
	component: VideoLayout,
});

function VideoLayout() {
	return <Outlet />;
}
