// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute } from "@tanstack/react-router";
import { CreditsPage } from "@/components/docs/credits-page";

export const Route = createFileRoute("/credits")({
	component: CreditsPage,
});
