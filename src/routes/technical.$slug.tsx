// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/docs/doc-page";
import { getDoc } from "@/docs/registry";

export const Route = createFileRoute("/technical/$slug")({
	component: TechnicalDocPage,
});

/** Publiczny dokument działu Techniczna — /technical/$slug (F3 #206). */
function TechnicalDocPage() {
	const { slug } = Route.useParams();
	const doc = getDoc("technical", slug);
	return <DocPage department="technical" doc={doc} />;
}
