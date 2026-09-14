// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/docs/")({
	component: DocsIndexPage,
});

/**
 * Indeks dokumentacji `/docs` — na razie strona „wkrótce" z listą dostępnych
 * dokumentów. Docelowo tutaj wyląduje pełna dokumentacja Wspólniaka.
 */

const AVAILABLE_DOCS = [
	{
		to: "/docs/big-photo",
		title: "Zdjęcie przekracza dozwolony rozmiar pliku",
	},
] as const;

function DocsIndexPage() {
	return (
		<main className="mx-auto max-w-3xl px-4 py-10 text-foreground sm:px-6">
			{/* Powrót — góra strony, lewy róg */}
			<div className="mb-6">
				<Button asChild variant="ghost" className="-ml-2 h-9 text-muted-foreground">
					<Link to="/app">
						<ArrowLeft aria-hidden />
						Powrót do Wspólniaka
					</Link>
				</Button>
			</div>

			{/* Breadcrumb */}
			<nav aria-label="Ścieżka" className="mb-8 text-sm text-muted-foreground">
				<ol className="flex items-center gap-2">
					<li>
						<Link to="/app" className="transition-colors hover:text-foreground">
							Wspólniak
						</Link>
					</li>
					<li aria-hidden>/</li>
					<li aria-current="page" className="text-foreground">
						Dokumentacja
					</li>
				</ol>
			</nav>

			{/* Nagłówek */}
			<header className="mb-10">
				<h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dokumentacja</h1>
				<p className="mt-3 text-muted-foreground">Pełna dokumentacja będzie dostępna wkrótce.</p>
			</header>

			{/* Dostępne dokumenty */}
			<section aria-labelledby="available-docs" className="space-y-3">
				<h2
					id="available-docs"
					className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
				>
					Dostępne dokumenty
				</h2>
				<ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
					{AVAILABLE_DOCS.map((doc) => (
						<li key={doc.to}>
							<Link
								to={doc.to}
								className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/50"
							>
								<FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
								<span className="min-w-0 flex-1 font-medium">{doc.title}</span>
								<ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
							</Link>
						</li>
					))}
				</ul>
			</section>
		</main>
	);
}
