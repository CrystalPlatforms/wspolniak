// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute } from "@tanstack/react-router";
import { DepartmentLayout } from "@/components/docs/department-layout";
import { DocPage } from "@/components/docs/doc-page";
import { getDoc } from "@/docs/registry";

export const Route = createFileRoute("/bugs/$slug")({
	component: BugsDocPage,
});

/** Publiczny dokument dzialu Bledy — /bugs/$slug (docsy). */
function BugsDocPage() {
	const { slug } = Route.useParams();
	const doc = getDoc("bugs", slug);
	return (
		<DepartmentLayout department="bugs" activeSlug={slug}>
			<DocPage department="bugs" doc={doc} />
		</DepartmentLayout>
	);
}
