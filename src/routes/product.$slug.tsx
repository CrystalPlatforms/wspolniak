// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/docs/doc-page";
import { getDoc } from "@/docs/registry";

export const Route = createFileRoute("/product/$slug")({
	component: ProductDocPage,
});

/** Publiczny dokument działu Produkt — /product/$slug (F1 #204). */
function ProductDocPage() {
	const { slug } = Route.useParams();
	const doc = getDoc("product", slug);
	return <DocPage department="product" doc={doc} />;
}
