// SPDX-License-Identifier: AGPL-3.0-or-later
// Współdzielona strona dokumentu docsów (F1 #204): przycisk powrotu, breadcrumb,
// tytuł i treść Markdown. Stan „nie znaleziono" dla nieznanych slugów. Współdzielony
// przez wszystkie działy — techniczny (F3) i bugs (F4) dostają go za darmo.
import { ArrowLeft, BookOpen, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDepartmentMeta } from "@/docs/departments";
import type { Doc, DocDepartment } from "@/docs/registry";
import { useAppHref, useDocsHref } from "@/docs/use-cross-host-href";
import { DocsMarkdown } from "./markdown";

interface DocPageProps {
	department: DocDepartment;
	doc: Doc | null;
}

export function DocPage({ department, doc }: DocPageProps) {
	const meta = getDepartmentMeta(department);
	// Linki międzyhostowe: cookie sesji nie jest współdzielony z docs.*, więc
	// „Powrót do Wspólniaka" prowadzi na GŁÓWNY host apki, a „Dokumentacja"
	// w breadcrumb — na host docsów (pełny URL po mount, bez hydration mismatch).
	const appHref = useAppHref("/app");
	const docsHref = useDocsHref("/");

	if (!doc) {
		return (
			<main className="mx-auto max-w-3xl px-4 py-10 text-foreground sm:px-6">
				<div className="mb-6">
					<Button asChild variant="ghost" className="-ml-2 h-9 text-muted-foreground">
						<a href={appHref}>
							<ArrowLeft aria-hidden />
							Powrót do Wspólniaka
						</a>
					</Button>
				</div>

				<div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center">
					<SearchX className="mx-auto size-8 text-muted-foreground" aria-hidden />
					<h1 className="mt-4 text-xl font-semibold">Nie znaleziono dokumentu</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Tak dokument nie istnieje — sprawdź adres albo wróć do dokumentacji.
					</p>
					<Button asChild variant="outline" className="mt-6">
						<a href="/">Dokumentacja</a>
					</Button>
				</div>
			</main>
		);
	}

	return (
		<main className="mx-auto max-w-3xl px-4 py-10 text-foreground sm:px-6">
			<div className="mb-6 flex flex-wrap items-center gap-2">
				<Button asChild variant="ghost" className="-ml-2 h-9 text-muted-foreground">
					<a href={appHref}>
						<ArrowLeft aria-hidden />
						Powrót do Wspólniaka
					</a>
				</Button>
				<Button asChild variant="ghost" className="h-9 text-muted-foreground">
					<a href={docsHref}>
						<BookOpen aria-hidden />
						Powrót do dokumentacji
					</a>
				</Button>
			</div>

			<nav aria-label="Ścieżka" className="mb-8 text-sm text-muted-foreground">
				<ol className="flex flex-wrap items-center gap-2">
					<li>
						<a href={appHref} className="transition-colors hover:text-foreground">
							Wspólniak
						</a>
					</li>
					<li aria-hidden>/</li>
					<li>
						{/* Dokumentacja = landing docsów na hoście docs.* (pełny URL). */}
						<a href={docsHref} className="transition-colors hover:text-foreground">
							Dokumentacja
						</a>
					</li>
					<li aria-hidden>/</li>
					<li>
						{/* Label działu prowadzi do docs landinga "/" — tam są karty działów. */}
						<a href="/" className="transition-colors hover:text-foreground">
							{meta.label}
						</a>
					</li>
					<li aria-hidden>/</li>
					<li aria-current="page" className="truncate text-foreground">
						{doc.title}
					</li>
				</ol>
			</nav>

			<header className="mb-10">
				<h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{doc.title}</h1>
			</header>

			<div className="space-y-4">
				<DocsMarkdown content={doc.content} />
			</div>
		</main>
	);
}
